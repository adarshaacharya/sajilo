use thiserror::Error;

/// A provider failure is always attributable to a source, so a partial refresh
/// can name which feed went dark instead of blanking the whole bundle.
#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("{source_name}: request failed: {message}")]
    Transport {
        source_name: &'static str,
        message: String,
    },
    #[error("{source_name}: upstream returned HTTP {status}")]
    Status {
        source_name: &'static str,
        status: u16,
    },
    /// The response arrived but did not look like what the parser expects.
    /// Distinct from a transport error because it means the *source changed*,
    /// which is a code fix rather than something that retries away.
    #[error("{source_name}: could not parse response: {message}")]
    Parse {
        source_name: &'static str,
        message: String,
    },
}

impl ProviderError {
    pub fn parse(source_name: &'static str, message: impl Into<String>) -> Self {
        Self::Parse {
            source_name,
            message: message.into(),
        }
    }

    /// Whether retrying the same request could plausibly succeed. A parse
    /// failure never fixes itself, so the scheduler must not hammer the source.
    pub fn is_retryable(&self) -> bool {
        match self {
            Self::Transport { .. } => true,
            Self::Status { status, .. } => *status == 429 || *status >= 500,
            Self::Parse { .. } => false,
        }
    }

    pub fn source_name(&self) -> &'static str {
        match self {
            Self::Transport { source_name, .. }
            | Self::Status { source_name, .. }
            | Self::Parse { source_name, .. } => source_name,
        }
    }
}

pub type Result<T> = std::result::Result<T, ProviderError>;
