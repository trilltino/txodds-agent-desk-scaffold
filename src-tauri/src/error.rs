use serde::ser::{SerializeStruct, Serializer};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("configuration error: {0}")]
    Config(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("rpc error {code}: {message}")]
    Rpc { code: i64, message: String },
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("sqlite error: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("task error: {0}")]
    Task(String),
}

impl AppError {
    fn code(&self) -> &'static str {
        match self {
            Self::Config(_) => "CONFIG",
            Self::InvalidInput(_) => "INVALID_INPUT",
            Self::NotFound(_) => "NOT_FOUND",
            Self::Rpc { .. } => "RPC",
            Self::Http(_) => "HTTP",
            Self::Io(_) => "IO",
            Self::Sql(_) => "SQLITE",
            Self::Json(_) => "JSON",
            Self::Task(_) => "TASK",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}
