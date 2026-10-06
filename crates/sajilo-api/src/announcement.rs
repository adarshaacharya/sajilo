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
        /// The oldest Sajilo version shown this notice, inclusive, like
        /// "0.1.32". Kept as text so one malformed bound hides only its own
        /// notice rather than failing the whole response.
        #[serde(default)]
        pub min_version: Option<String>,
        /// The newest Sajilo version shown this notice, inclusive.
        #[serde(default)]
        pub max_version: Option<String>,
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

dto! {
    /// Notices published through the signed config channel rather than the
    /// announcements Worker: free to serve, and changed only by a PR.
    pub struct AnnouncementsPack {
        #[serde(default)]
        pub notices: Vec<Announcement>,
    }
}

const MAX_NOTICES: usize = 20;
const TITLE_MAX: usize = 180;
const BODY_MAX: usize = 320;

/// `0.1.32` as numbers, or `None` for anything else.
pub fn parse_version(text: &str) -> Option<(u64, u64, u64)> {
    let mut parts = text.trim().trim_start_matches('v').split('.');
    let mut next = || parts.next()?.parse::<u64>().ok();
    let version = (next()?, next()?, next()?);
    parts.next().is_none().then_some(version)
}

fn check_text(field: &str, text: &LocalizedText, max: usize) -> Result<(), String> {
    use sajilo_core::config::check;
    check::text(&format!("{field}.en"), &text.en, max)?;
    check::text(&format!("{field}.ne"), &text.ne, max)
}

impl Announcement {
    /// What the Worker's `problem()` checks, in Rust.
    pub fn problem(&self) -> Option<String> {
        let check = || -> Result<(), String> {
            if self.id.is_empty()
                || self.id.len() > 64
                || !self
                    .id
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            {
                return Err("id must be a short slug".to_owned());
            }
            check_text("title", &self.title, TITLE_MAX)?;
            check_text("body", &self.body, BODY_MAX)?;
            if let (Some(starts), Some(expires)) = (self.starts_at, self.expires_at)
                && starts >= expires
            {
                return Err("startsAt must be before expiresAt".to_owned());
            }
            for (field, version) in [
                ("minVersion", &self.min_version),
                ("maxVersion", &self.max_version),
            ] {
                if let Some(version) = version
                    && parse_version(version).is_none()
                {
                    return Err(format!("{field} is not a version"));
                }
            }
            if let (Some(min), Some(max)) = (&self.min_version, &self.max_version)
                && parse_version(min) > parse_version(max)
            {
                return Err("minVersion must not be after maxVersion".to_owned());
            }
            if let Some(action) = &self.action {
                sajilo_core::config::check::https_url("action.url", &action.url)?;
                check_text("action.label", &action.label, TITLE_MAX)?;
            }
            Ok(())
        };
        check()
            .err()
            .map(|message| format!("{}: {message}", self.id))
    }
}

impl sajilo_core::config::Pack for AnnouncementsPack {
    const NAME: &'static str = "announcements";
    const SCHEMA: u32 = 1;

    fn bundled_json() -> &'static str {
        include_str!("../../../data/config/announcements.json")
    }

    fn validate(&self) -> Result<(), String> {
        if self.notices.len() > MAX_NOTICES {
            return Err(format!("more than {MAX_NOTICES} notices"));
        }
        let mut ids = std::collections::BTreeSet::new();
        for notice in &self.notices {
            if let Some(problem) = notice.problem() {
                return Err(problem);
            }
            if !ids.insert(notice.id.as_str()) {
                return Err(format!("{} appears twice", notice.id));
            }
        }
        Ok(())
    }

    fn slot() -> &'static sajilo_core::config::Slot<Self> {
        static SLOT: sajilo_core::config::Slot<AnnouncementsPack> =
            sajilo_core::config::Slot::new();
        &SLOT
    }
}
