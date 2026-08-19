//! Freshness rules from PRD §6: `loading → fresh → stale → unavailable`, where
//! a failed refresh never discards what is already on screen.
//!
//! A remote module must never silently show nothing. Every value the client
//! renders arrives wrapped in one of these variants, so "we have no idea" and
//! "we have yesterday's number" are different states in the type system rather
//! than a convention nobody enforces.

use chrono::{DateTime, Utc};

dto! {
    /// How much a caller should trust the value it is holding.
    #[serde(tag = "status", content = "value")]
    #[derive(Default)]
    pub enum LoadState<T> {
        /// A request is in flight and nothing has been shown yet.
        #[default]
        Loading,
        /// Fetched inside its staleness window.
        Fresh(T),
        /// The last good value, past its window. Shown, but labelled.
        Stale(T),
        /// Nothing has ever been fetched successfully.
        Unavailable,
        /// A refresh failed and there is nothing cached to fall back on.
        Failed(String),
    }
}

impl<T> LoadState<T> {
    /// The value, whether fresh or stale. `None` for the states that carry one.
    pub fn value(&self) -> Option<&T> {
        match self {
            Self::Fresh(value) | Self::Stale(value) => Some(value),
            Self::Loading | Self::Unavailable | Self::Failed(_) => None,
        }
    }

    pub fn is_stale(&self) -> bool {
        matches!(self, Self::Stale(_))
    }

    pub fn map<U>(self, f: impl FnOnce(T) -> U) -> LoadState<U> {
        match self {
            Self::Fresh(value) => LoadState::Fresh(f(value)),
            Self::Stale(value) => LoadState::Stale(f(value)),
            Self::Loading => LoadState::Loading,
            Self::Unavailable => LoadState::Unavailable,
            Self::Failed(message) => LoadState::Failed(message),
        }
    }

    /// Classifies a cached value by age. This is the only place the
    /// fresh/stale decision is made, so no module can invent its own rule.
    pub fn from_cache(
        value: T,
        fetched_at: DateTime<Utc>,
        max_age_secs: i64,
        now: DateTime<Utc>,
    ) -> Self {
        if (now - fetched_at).num_seconds() < max_age_secs {
            Self::Fresh(value)
        } else {
            Self::Stale(value)
        }
    }
}

dto! {
    /// When a payload was fetched and how old the source says it is. Carried
    /// alongside every module so the UI can label a value without guessing.
    pub struct Freshness {
        /// When Sajilo fetched it.
        pub fetched_at: DateTime<Utc>,
        /// The timestamp the *source* published, when it gives one. Showing
        /// only the fetch time would call a week-old bank rate "just now".
        pub source_timestamp: Option<DateTime<Utc>>,
    }
}

impl Freshness {
    pub fn new(fetched_at: DateTime<Utc>) -> Self {
        Self {
            fetched_at,
            source_timestamp: None,
        }
    }

    pub fn with_source(mut self, source_timestamp: DateTime<Utc>) -> Self {
        self.source_timestamp = Some(source_timestamp);
        self
    }
}
