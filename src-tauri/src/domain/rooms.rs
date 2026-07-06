//! Consumer track contract: Pulse Rooms.
//!
//! A room binds a group of members to one fixture; TxLINE events drive
//! deterministic scoring deltas and fan-facing pulse cards. No wagering or
//! settlement concepts belong here - consumer mode is social only.

#![allow(dead_code)] // Staged contract: consumed by the room engine in PR 3.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoomMode {
    Sweepstake,
    PredictionStreak,
    Mixed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomMember {
    pub id: String,
    pub display_name: String,
    pub joined_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomPick {
    pub member_id: String,
    pub pick: String,
    pub submitted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardEntry {
    pub member_id: String,
    pub points: i64,
    /// Human-readable reason for the latest delta, shown next to the score.
    pub last_delta: Option<String>,
}

/// Fan-facing card produced when an event is classified as room-relevant,
/// carrying before/after implied probability so odds moves are explainable.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PulseCard {
    pub id: String,
    pub fixture_id: u64,
    pub source_event_id: String,
    pub title: String,
    pub body: String,
    pub implied_before: Option<f64>,
    pub implied_after: Option<f64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PulseRoom {
    pub id: String,
    pub fixture_id: u64,
    pub name: String,
    pub mode: RoomMode,
    pub members: Vec<RoomMember>,
    pub picks: Vec<RoomPick>,
    pub leaderboard: Vec<LeaderboardEntry>,
    pub timeline: Vec<PulseCard>,
    pub created_at: String,
    pub updated_at: String,
}
