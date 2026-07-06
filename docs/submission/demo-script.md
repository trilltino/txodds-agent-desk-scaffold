# 5-Minute Demo Script

## 0:00 - Problem

Fans, builders, and operators can access TxLINE data, but raw feeds are not products. Fans need context, markets need trustworthy resolution, and operators need autonomous signal tracking.

## 0:45 - Product

World Cup Pulse Desk turns TxLINE events into three product surfaces: Pulse Rooms, Verified Markets, and one Match Intelligence Agent. One Rust-owned event bus powers all three.

## 1:20 - Live Data

Show the fixture board and raw TxLINE feed. Explain that native mode uses Rust-owned SSE clients for `/api/odds/stream` and `/api/scores/stream`; browser mode is only a mock fallback for UI iteration.

## 2:00 - Pulse Rooms

Select a fixture event and show the Pulse Rooms panel. Explain how the same raw event becomes fan-facing copy, room moments, and future leaderboard changes.

## 2:50 - Verified Markets

Show the Verified Markets panel and proof drawer. Explain that TxLINE proves match data, Triton observes Solana state, and the tx-on-chain integration plan fills the Merkle-root/stat-validation gate.

## 3:45 - Match Intelligence Agent

Show the Intelligence Agent panel. Explain the transition from the compatibility round to one autonomous runtime: observe, decide, act, evaluate. Point to deterministic thresholds and SQLite traces.

## 4:40 - Close

This is not a pitch deck: it is a running desktop app with Rust-owned live TxLINE ingestion, typed Tauri events, replayable evidence, and a repo structure ready for the three E2E track builds.
