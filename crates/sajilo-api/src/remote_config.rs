//! What the desktop knows about its remote config, for the System tab, and
//! the packs a screen reads through a command.

use chrono::{DateTime, Utc};
use sajilo_core::config::directory::DirectoryPack;

dto_enum! {
    /// Where an active pack came from.
    pub enum PackSource {
        /// Compiled into this build.
        Bundled,
        /// Downloaded, verified and installed.
        Remote,
    }
}

dto! {
    pub struct PackStatus {
        pub name: String,
        pub source: PackSource,
    }

    pub struct RemoteConfigStatus {
        /// The rev of the last manifest applied; `None` before the first.
        /// A Unix timestamp, well inside a JS number.
        #[cfg_attr(feature = "typescript", ts(type = "number | null"))]
        pub rev: Option<u64>,
        /// The last time the manifest was checked, successfully or not.
        pub checked_at: Option<DateTime<Utc>>,
        /// Why the last check did not apply everything, if it didn't.
        pub error: Option<String>,
        pub packs: Vec<PackStatus>,
    }

    /// The directory pack, wrapped so its bindings are generated with the
    /// rest of the contract.
    pub struct DirectoryResponse {
        pub directory: DirectoryPack,
    }
}
