//! Export commands: stable hash receipts and fan-card file exports.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::State;

use crate::error::AppError;
use crate::state::DesktopState;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashReceipt {
    pub sha256: String,
    pub reference: String,
}

/// Native export results return a local path plus user-facing copy. The webview
/// requests the export but Rust owns filesystem writes.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub share_text: String,
}

#[tauri::command]
pub fn hash_delivery(payload: String) -> HashReceipt {
    // Stable hash/reference helper used by the webview for local artifacts and
    // by future settlement/proof flows.
    let sha256 = sha256_hex(&payload);
    HashReceipt {
        reference: format!("sha256:{sha256}"),
        sha256,
    }
}

#[tauri::command]
pub async fn export_fan_card(
    run_id: String,
    state: State<'_, DesktopState>,
) -> Result<ExportResult, AppError> {
    // Export uses the ledger as source of truth so the webview cannot write
    // arbitrary filesystem data.
    let run = {
        let ledger = state
            .ledger
            .lock()
            .map_err(|_| AppError::Task("ledger lock poisoned".to_string()))?;
        ledger.get_run(&run_id)?
    };
    tokio::fs::create_dir_all(&state.export_dir).await?;
    let path = state.export_dir.join(format!("{run_id}.txt"));
    let share_text = run
        .delivery
        .as_ref()
        .and_then(|delivery| delivery.fan_copy.clone())
        .unwrap_or_else(|| format!("{} - {}", run.trigger.title, run.trigger.body));
    let contents = format!(
        "World Cup Pulse Desk\n\n{}\n\nRun: {}\nTrack: {}\n",
        share_text, run.run_id, run.track
    );
    tokio::fs::write(&path, contents).await?;
    Ok(ExportResult {
        path: path.to_string_lossy().to_string(),
        share_text,
    })
}

fn sha256_hex(text: &str) -> String {
    // Hex SHA-256 is used for stable delivery references across Rust and JS.
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hex::encode(hasher.finalize())
}
