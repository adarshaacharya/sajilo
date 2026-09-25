//! Short, remotely published notices for the Today screen.
//!
//! Intentionally a small contract: a handful of records, each with an optional
//! action, two first-class languages, and optionally the platforms it is for.
//! IPOs and other structured feeds get their own contracts rather than turning
//! this into a generic content system.

dto_enum! {
    pub enum AnnouncementLevel {
        Info,
        Important,
        Urgent,
    }

    /// Which desktop a notice is for. Matched on the device: the app never
    /// says which platform it runs on.
    pub enum AnnouncementPlatform {
        Windows,
        Macos,
        Linux,
    }
}

dto! {
    pub struct LocalizedText {
        pub en: String,
        pub ne: String,
    }

    pub struct AnnouncementAction {
        pub url: String,
        pub label: LocalizedText,
    }

    pub struct Announcement {
        pub id: String,
        pub level: AnnouncementLevel,
        pub title: LocalizedText,
        pub body: LocalizedText,
        #[serde(default)]
        pub starts_at: Option<chrono::DateTime<chrono::Utc>>,
        #[serde(default)]
        pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
        #[serde(default)]
        pub action: Option<AnnouncementAction>,
        /// Empty means every platform.
        #[serde(default)]
        pub platforms: Vec<AnnouncementPlatform>,
    }

    /// The notices live now, most pressing first. A wrapper, not HTTP 204, so
    /// Sajilo caches the deliberate absence of notices too; otherwise an
    /// expired one would linger until its cache entry aged out.
    ///
    /// The Worker also sends a single `announcement` field, which this type
    /// ignores: it is what versions before the list read, and it carries a
    /// standing "update Sajilo" notice for them.
    pub struct AnnouncementResponse {
        #[serde(default)]
        pub announcements: Vec<Announcement>,
    }
}
