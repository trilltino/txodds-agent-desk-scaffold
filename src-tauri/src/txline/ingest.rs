//! TxLINE live/mock/replay ingestion.
//!
//! Live mode owns TxLINE credentials in Rust, mock mode keeps demos offline, and
//! replay mode re-emits previously recorded JSONL events.

use std::path::{Path, PathBuf};
use std::time::Duration;

use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

use crate::config::AppConfig;
use crate::types::{mock_events, now_iso, TxLineEvent, TxLineEventKind};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct IngestStatus {
    // Source is live/mock/replay so the UI can report the active ingest mode.
    source: String,
    state: String,
    detail: String,
}

pub fn spawn_txline(
    app: AppHandle,
    client: Client,
    config: AppConfig,
    mode: String,
    fixture_id: Option<String>,
    replay_dir: PathBuf,
) -> tauri::async_runtime::JoinHandle<()> {
    // Spawn one independent task per requested mode. lib.rs owns task
    // cancellation when switching modes.
    tauri::async_runtime::spawn(async move {
        match mode.as_str() {
            "live" => live_loop(app, client, config, replay_dir).await,
            "replay" => replay_loop(app, replay_dir, fixture_id).await,
            _ => mock_loop(app).await,
        }
    })
}

async fn mock_loop(app: AppHandle) {
    // Mock mode emits built-in events with a short delay to resemble a live feed.
    emit_status(&app, "mock", "connected", "Rust mock TxLINE stream active");
    for event in mock_events() {
        emit_event(&app, event);
        tokio::time::sleep(Duration::from_millis(800)).await;
    }
    emit_status(&app, "mock", "stopped", "mock stream completed");
}

async fn replay_loop(app: AppHandle, replay_dir: PathBuf, fixture_id: Option<String>) {
    // Replay mode is judging-day insurance: the app can demonstrate real event
    // shapes without a live TxLINE connection.
    emit_status(&app, "replay", "connected", "Rust replay stream active");
    let fixture = fixture_id.unwrap_or_else(|| "default".to_string());
    let path = replay_dir.join(format!("{fixture}.jsonl"));
    let contents = match tokio::fs::read_to_string(&path).await {
        Ok(contents) => contents,
        Err(_) => {
            emit_status(
                &app,
                "replay",
                "reconnecting",
                "no replay found; falling back to built-in mock events",
            );
            mock_loop(app).await;
            return;
        }
    };

    // JSONL keeps replay append simple and lets corrupted lines be reported
    // without dropping the whole replay file.
    for line in contents.lines().filter(|line| !line.trim().is_empty()) {
        match serde_json::from_str::<TxLineEvent>(line) {
            Ok(event) => emit_event(&app, event),
            Err(err) => emit_status(&app, "replay", "reconnecting", &err.to_string()),
        }
        tokio::time::sleep(Duration::from_millis(450)).await;
    }
    emit_status(&app, "replay", "stopped", "replay stream completed");
}

async fn live_loop(app: AppHandle, client: Client, config: AppConfig, replay_dir: PathBuf) {
    // Missing credentials degrade to mock mode rather than leaving the UI empty.
    let Some(jwt) = config.txline_guest_jwt.as_deref() else {
        emit_status(
            &app,
            "live",
            "reconnecting",
            "TXLINE_GUEST_JWT missing; using mock stream",
        );
        mock_loop(app).await;
        return;
    };
    let Some(token) = config.txline_api_token.as_deref() else {
        emit_status(
            &app,
            "live",
            "reconnecting",
            "TXLINE_API_TOKEN missing; using mock stream",
        );
        mock_loop(app).await;
        return;
    };

    emit_status(
        &app,
        "live",
        "connected",
        "Rust TxLINE SSE client connecting",
    );
    // Current live integration reads the odds stream; score/proof streams can be
    // added as parallel loops later.
    let stream_url = format!(
        "{}/api/odds/stream",
        config.txline_api_origin.trim_end_matches('/')
    );
    let response = match client
        .get(stream_url)
        .bearer_auth(jwt)
        .header("X-Api-Token", token)
        .header("Accept", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .send()
        .await
    {
        Ok(response) => response,
        Err(err) => {
            emit_status(&app, "live", "reconnecting", &err.to_string());
            return;
        }
    };

    if !response.status().is_success() {
        emit_status(
            &app,
            "live",
            "reconnecting",
            &format!("TxLINE SSE HTTP {}", response.status()),
        );
        return;
    }

    let mut buffer = String::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let Ok(chunk) = chunk else {
            emit_status(&app, "live", "reconnecting", "TxLINE stream chunk failed");
            break;
        };
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        // SSE frames are separated by a blank line. Buffering protects against
        // chunk boundaries splitting a JSON payload.
        while let Some(index) = buffer.find("\n\n") {
            let block = buffer[..index].to_string();
            buffer = buffer[index + 2..].to_string();
            if let Some(event) = parse_sse_block("odds", &block) {
                append_replay(&replay_dir, &event).await;
                emit_event(&app, event);
            }
        }
    }
    emit_status(&app, "live", "stopped", "TxLINE live stream ended");
}

fn parse_sse_block(stream: &str, block: &str) -> Option<TxLineEvent> {
    // Only `data:` lines are converted; retry/id/event fields can be added when
    // the upstream stream requires them.
    let data_line = block
        .lines()
        .find(|line| line.trim_start().starts_with("data:"))?;
    let payload = data_line
        .trim_start()
        .strip_prefix("data:")
        .unwrap_or(data_line)
        .trim();
    let raw = serde_json::from_str::<Value>(payload).ok()?;
    // Keep raw payload for diagnostics while normalizing the stable fields used
    // by the market engine.
    let fixture_id = raw
        .get("fixtureId")
        .or_else(|| raw.get("id"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    Some(TxLineEvent {
        id: format!("{stream}-{}", uuid::Uuid::new_v4()),
        kind: if stream == "odds" {
            TxLineEventKind::OddsUpdate
        } else {
            TxLineEventKind::ScoreUpdate
        },
        fixture_id,
        title: format!("{stream} update"),
        body: "Live TxLINE SSE event received by Rust".to_string(),
        ts: now_iso(),
        raw: Some(raw),
        odds: None,
        score: None,
        proof: None,
    })
}

async fn append_replay(replay_dir: &Path, event: &TxLineEvent) {
    // Replay append is best-effort. Failure should not prevent live events from
    // reaching the UI.
    if tokio::fs::create_dir_all(replay_dir).await.is_err() {
        return;
    }
    let path = replay_dir.join("default.jsonl");
    let Ok(mut file) = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await
    else {
        return;
    };
    if let Ok(line) = serde_json::to_string(event) {
        let _ = file.write_all(line.as_bytes()).await;
        let _ = file.write_all(b"\n").await;
    }
}

fn emit_event(app: &AppHandle, event: TxLineEvent) {
    // txline://event is the canonical webview feed event.
    let _ = app.emit("txline://event", event);
}

fn emit_status(app: &AppHandle, source: &str, state: &str, detail: &str) {
    // Status events share a shape with Yellowstone status updates.
    let _ = app.emit(
        "ingest://status",
        IngestStatus {
            source: source.to_string(),
            state: state.to_string(),
            detail: detail.to_string(),
        },
    );
}
