//! A short, remotely published notice for the Today screen.
//!
//! This is intentionally a small contract: one record, optional action, and
//! two first-class languages. IPOs and other structured feeds will gain their
//! own contracts rather than turning this into a generic content system.

dto_enum! {
    pub enum AnnouncementLevel {
        Info,
        Important,
        Urgent,
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
    }

    /// A wrapper instead of HTTP 204 lets Sajilo cache the deliberate absence
    /// of a notice. Otherwise an expired banner would remain visible until the
    /// app restarted or its previous cache entry aged out.
    pub struct AnnouncementResponse {
        pub announcement: Option<Announcement>,
    }
}
