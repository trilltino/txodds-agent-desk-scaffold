//! SQLite run ledger.
//!
//! The ledger persists complete AgentRun JSON so the app can recover demo/proof
//! history across restarts while the schema remains easy to evolve.

use std::path::Path;

use rusqlite::{params, Connection};

use crate::domain::agent::{AgentDecision, AgentSignal};
use crate::error::AppError;
use crate::services::llm::LlmResponse;
use crate::services::solana_pay::SolanaPayIntent;
use crate::types::{AgentRun, TxLineEvent, TxLineProofReceipt};

pub struct LedgerStore {
    // rusqlite connection is synchronous; callers protect LedgerStore with a
    // Mutex when sharing it across async Tauri commands.
    conn: Connection,
}

impl LedgerStore {
    // Open or create the ledger database and ensure required tables exist.
    pub fn open(path: impl AsRef<Path>) -> Result<Self, AppError> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "
            -- WAL improves resilience for desktop apps where reads and writes
            -- can happen from separate command/task contexts.
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS runs (
                run_id TEXT PRIMARY KEY,
                track TEXT NOT NULL,
                trigger_json TEXT NOT NULL,
                run_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS payment_intents (
                reference TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                intent_json TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agent_observations (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                fixture_id INTEGER NOT NULL,
                event_id TEXT NOT NULL,
                event_kind TEXT NOT NULL,
                event_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agent_signals (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                fixture_id INTEGER NOT NULL,
                signal_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agent_decisions (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                signal_id TEXT,
                action TEXT NOT NULL,
                decision_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS proof_receipts (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                fixture_id INTEGER NOT NULL,
                seq INTEGER,
                status TEXT NOT NULL,
                verified INTEGER NOT NULL,
                receipt_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agent_llm_calls (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                used INTEGER NOT NULL,
                response_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            ",
        )?;
        Ok(Self { conn })
    }

    // Insert/update a complete run. Storing both trigger_json and run_json keeps
    // future querying options open while preserving the exact UI/audit payload.
    pub fn upsert_run(&self, run: &AgentRun) -> Result<(), AppError> {
        let trigger_json = serde_json::to_string(&run.trigger)?;
        let run_json = serde_json::to_string(run)?;
        // Use the trigger timestamp as created_at when available so list order
        // remains stable after later updates.
        let created_at = run
            .timeline
            .first()
            .map(|entry| entry.at.clone())
            .unwrap_or_else(crate::types::now_iso);

        self.conn.execute(
            "
            INSERT INTO runs (run_id, track, trigger_json, run_json, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(run_id) DO UPDATE SET
                track = excluded.track,
                trigger_json = excluded.trigger_json,
                run_json = excluded.run_json
            ",
            params![
                run.run_id,
                run.track.to_string(),
                trigger_json,
                run_json,
                created_at
            ],
        )?;
        Ok(())
    }

    // Return the newest runs for the history surface.
    pub fn list_runs(&self) -> Result<Vec<AgentRun>, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT run_json FROM runs ORDER BY created_at DESC LIMIT 100")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;

        // Deserialize row-by-row so a JSON/schema problem maps through AppError.
        let mut runs = Vec::new();
        for row in rows {
            runs.push(serde_json::from_str::<AgentRun>(&row?)?);
        }
        Ok(runs)
    }

    // Load one persisted run by id.
    pub fn get_run(&self, run_id: &str) -> Result<AgentRun, AppError> {
        let run_json: String = self
            .conn
            .query_row(
                "SELECT run_json FROM runs WHERE run_id = ?1",
                params![run_id],
                |row| row.get(0),
            )
            .map_err(|err| match err {
                rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(run_id.to_string()),
                other => AppError::Sql(other),
            })?;
        Ok(serde_json::from_str(&run_json)?)
    }

    pub fn upsert_payment_intent(&self, intent: &SolanaPayIntent) -> Result<(), AppError> {
        let intent_json = serde_json::to_string(intent)?;
        self.conn.execute(
            "
            INSERT INTO payment_intents (reference, run_id, intent_json, status, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(reference) DO UPDATE SET
                intent_json = excluded.intent_json,
                status = excluded.status,
                updated_at = excluded.updated_at
            ",
            params![
                &intent.reference,
                &intent.run_id,
                intent_json,
                intent.status_text(),
                &intent.created_at,
                crate::types::now_iso()
            ],
        )?;
        Ok(())
    }

    pub fn list_payment_intents(
        &self,
        run_id: Option<&str>,
    ) -> Result<Vec<SolanaPayIntent>, AppError> {
        let mut intents = Vec::new();
        if let Some(run_id) = run_id {
            let mut stmt = self.conn.prepare(
                "SELECT intent_json FROM payment_intents WHERE run_id = ?1 ORDER BY created_at DESC",
            )?;
            let rows = stmt.query_map(params![run_id], |row| row.get::<_, String>(0))?;
            for row in rows {
                intents.push(serde_json::from_str::<SolanaPayIntent>(&row?)?);
            }
        } else {
            let mut stmt = self
                .conn
                .prepare("SELECT intent_json FROM payment_intents ORDER BY created_at DESC")?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
            for row in rows {
                intents.push(serde_json::from_str::<SolanaPayIntent>(&row?)?);
            }
        }
        Ok(intents)
    }

    pub fn get_payment_intent_by_reference(
        &self,
        reference: &str,
    ) -> Result<SolanaPayIntent, AppError> {
        let intent_json: String = self
            .conn
            .query_row(
                "SELECT intent_json FROM payment_intents WHERE reference = ?1",
                params![reference],
                |row| row.get(0),
            )
            .map_err(|err| match err {
                rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(reference.to_string()),
                other => AppError::Sql(other),
            })?;
        Ok(serde_json::from_str(&intent_json)?)
    }

    pub fn insert_agent_observation(
        &self,
        run_id: &str,
        event: &TxLineEvent,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "
            INSERT INTO agent_observations
                (id, run_id, fixture_id, event_id, event_kind, event_json, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(id) DO UPDATE SET event_json = excluded.event_json
            ",
            params![
                format!("{run_id}:{}", event.id),
                run_id,
                event.fixture_id,
                event.id,
                format!("{:?}", event.kind),
                serde_json::to_string(event)?,
                event.ts
            ],
        )?;
        Ok(())
    }

    pub fn insert_agent_signal(&self, run_id: &str, signal: &AgentSignal) -> Result<(), AppError> {
        self.conn.execute(
            "
            INSERT INTO agent_signals (id, run_id, fixture_id, signal_json, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(id) DO UPDATE SET signal_json = excluded.signal_json
            ",
            params![
                signal.id,
                run_id,
                signal.fixture_id,
                serde_json::to_string(signal)?,
                signal.created_at
            ],
        )?;
        Ok(())
    }

    pub fn insert_agent_decision(
        &self,
        run_id: &str,
        decision: &AgentDecision,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "
            INSERT INTO agent_decisions (id, run_id, signal_id, action, decision_json, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(id) DO UPDATE SET decision_json = excluded.decision_json
            ",
            params![
                decision.id,
                run_id,
                decision.signal_id,
                format!("{:?}", decision.action),
                serde_json::to_string(decision)?,
                decision.created_at
            ],
        )?;
        Ok(())
    }

    pub fn insert_proof_receipt(
        &self,
        run_id: &str,
        receipt: &TxLineProofReceipt,
    ) -> Result<(), AppError> {
        self.conn.execute(
            "
            INSERT INTO proof_receipts
                (id, run_id, fixture_id, seq, status, verified, receipt_json, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(id) DO UPDATE SET receipt_json = excluded.receipt_json
            ",
            params![
                format!(
                    "{run_id}:{}:{}",
                    receipt.fixture_id,
                    receipt
                        .seq
                        .map(|seq| seq.to_string())
                        .unwrap_or_else(|| "none".to_string())
                ),
                run_id,
                receipt.fixture_id,
                receipt.seq,
                format!("{:?}", receipt.simulation_status),
                receipt.verified,
                serde_json::to_string(receipt)?,
                crate::types::now_iso()
            ],
        )?;
        Ok(())
    }

    pub fn insert_llm_call(&self, run_id: &str, response: &LlmResponse) -> Result<(), AppError> {
        self.conn.execute(
            "
            INSERT INTO agent_llm_calls
                (id, run_id, provider, model, used, response_json, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ",
            params![
                format!("{run_id}:{}", uuid::Uuid::new_v4()),
                run_id,
                response.provider,
                response.model,
                response.used,
                serde_json::to_string(response)?,
                crate::types::now_iso()
            ],
        )?;
        Ok(())
    }
}
