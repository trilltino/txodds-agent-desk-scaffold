//! First-class CoralOS session and transcript primitives.
//!
//! The legacy `services::coral` module still produces the compatibility round.
//! This module is the orchestration fabric around it: typed messages, sessions,
//! and replayable transcript artifacts.

pub mod protocol;
pub mod transcript;
