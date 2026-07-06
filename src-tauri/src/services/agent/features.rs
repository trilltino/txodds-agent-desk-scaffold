//! Deterministic market feature extraction.

use serde::{Deserialize, Serialize};

use crate::types::{TxLineEvent, TxLineEventKind, ValidationSimulationStatus};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketFeatures {
    pub fixture_id: u64,
    pub kind: String,
    pub has_score: bool,
    pub has_odds: bool,
    pub best_implied_probability: Option<f64>,
    pub proof_present: bool,
    pub root_present: bool,
    pub txoracle_passed: bool,
    pub severity_score: f64,
    pub actionability_score: f64,
    pub reasons: Vec<String>,
}

pub fn derive_features(event: &TxLineEvent) -> MarketFeatures {
    let mut features = MarketFeatures {
        fixture_id: event.fixture_id,
        kind: format!("{:?}", event.kind),
        has_score: event.score.is_some(),
        has_odds: event
            .odds
            .as_ref()
            .map(|items| !items.is_empty())
            .unwrap_or(false),
        best_implied_probability: best_implied_probability(event),
        proof_present: event
            .proof
            .as_ref()
            .map(|proof| proof.proof_present)
            .unwrap_or(false),
        root_present: event
            .proof
            .as_ref()
            .map(|proof| proof.root_present)
            .unwrap_or(false),
        txoracle_passed: event
            .proof
            .as_ref()
            .map(|proof| matches!(proof.simulation_status, ValidationSimulationStatus::Passed))
            .unwrap_or(false),
        ..MarketFeatures::default()
    };

    match &event.kind {
        TxLineEventKind::Goal => {
            features.severity_score += 0.80;
            features
                .reasons
                .push("goal changes match state".to_string());
        }
        TxLineEventKind::RedCard => {
            features.severity_score += 0.78;
            features
                .reasons
                .push("red card can reprice market".to_string());
        }
        TxLineEventKind::FinalWhistle => {
            features.severity_score += 0.72;
            features
                .reasons
                .push("final whistle can trigger resolution".to_string());
        }
        TxLineEventKind::OddsMove | TxLineEventKind::OddsUpdate => {
            features.severity_score += 0.64;
            features.reasons.push("odds update observed".to_string());
        }
        TxLineEventKind::ProofReceived => {
            features.severity_score += 0.70;
            features.reasons.push("proof receipt arrived".to_string());
        }
        _ => {
            features.severity_score += 0.35;
            features.reasons.push("context update observed".to_string());
        }
    }

    if features.has_odds {
        features.actionability_score += 0.20;
    }
    if features.has_score {
        features.actionability_score += 0.20;
    }
    if features.proof_present {
        features.actionability_score += 0.20;
    }
    if features.root_present {
        features.actionability_score += 0.20;
    }
    if features.txoracle_passed {
        features.actionability_score += 0.20;
    }

    features.severity_score = features.severity_score.min(1.0);
    features.actionability_score = features.actionability_score.min(1.0);
    features
}

fn best_implied_probability(event: &TxLineEvent) -> Option<f64> {
    event
        .odds
        .as_ref()?
        .iter()
        .map(|quote| quote.implied_probability)
        .filter(|value| value.is_finite())
        .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
}
