//! Server-controlled client policy, served at `/v1/meta`.

dto! {
    pub struct Meta {
        /// Clients older than this are asked to update. Lets a breaking change
        /// to the contract be rolled out without bricking older installs
        /// silently.
        pub min_client_version: String,
        /// A short notice shown in Settings — maintenance windows, a source
        /// that has gone away for good.
        pub notice: Option<String>,
    }

    /// Per-feed liveness, served at `/v1/health`.
    pub struct FeedHealth {
        pub module: String,
        pub last_success: Option<chrono::DateTime<chrono::Utc>>,
        pub consecutive_failures: u32,
    }

    pub struct Health {
        pub feeds: Vec<FeedHealth>,
    }
}
