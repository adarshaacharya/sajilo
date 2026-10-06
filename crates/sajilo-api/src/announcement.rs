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

    /// What an announcement is about. Each kind has its own switch in
    /// Settings › Notifications › From Sajilo.
    #[derive(Default)]
    pub enum AnnouncementCategory {
        /// A civic notice: a holiday declared, a bandh, an alert.
        Notice,
        /// A festival or new-year greeting, on the day.
        Greeting,
        /// A new version, or a nudge to update.
        Update,
        /// A source running late or down, shown on that screen.
        Status,
        /// How to use something in Sajilo.
        Tip,
        /// A survey or a request for feedback.
        Ask,
        /// Anything else; follows no switch.
        #[default]
        General,
    }

    /// How an announcement arrives.
    pub enum AnnouncementDelivery {
        /// A banner on its screen, nothing more.
        Quiet,
        /// The banner, and once a pop-up: a card or a system notification,
        /// whichever the user picked for reminders.
        Popup,
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
        #[serde(default)]
        pub category: AnnouncementCategory,
        /// Left out, it follows the category (and `level`: urgent pops up).
        #[serde(default)]
        pub delivery: Option<AnnouncementDelivery>,
        /// The screen a banner belongs on (`bazar`, `news`, …); left out, Today.
        /// A Status notice says what is late where it is late.
        #[serde(default)]
        pub screen: Option<String>,
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

/// The screens a banner can be placed on.
pub const BANNER_SCREENS: [&str; 6] = ["today", "bazar", "news", "rashifal", "radio", "weather"];

impl Announcement {
    /// How this one arrives: as published, else the category's default.
    /// An urgent notice always pops up.
    pub fn effective_delivery(&self) -> AnnouncementDelivery {
        if self.level == AnnouncementLevel::Urgent {
            return AnnouncementDelivery::Popup;
        }
        self.delivery.unwrap_or(match self.category {
            AnnouncementCategory::Notice | AnnouncementCategory::Greeting => {
                AnnouncementDelivery::Popup
            }
            AnnouncementCategory::Update
            | AnnouncementCategory::Status
            | AnnouncementCategory::Tip
            | AnnouncementCategory::Ask
            | AnnouncementCategory::General => AnnouncementDelivery::Quiet,
        })
    }

    /// Whether the user's From Sajilo switches let this category through.
    /// Status and general notices follow no switch.
    pub fn allowed_by(&self, options: &sajilo_core::notify::NotificationOptions) -> bool {
        match self.category {
            AnnouncementCategory::Notice => options.sajilo_notices,
            AnnouncementCategory::Greeting => options.sajilo_greetings,
            AnnouncementCategory::Update => options.sajilo_updates,
            AnnouncementCategory::Tip => options.sajilo_tips,
            AnnouncementCategory::Ask => options.sajilo_asks,
            AnnouncementCategory::Status | AnnouncementCategory::General => true,
        }
    }

    /// The screen its banner shows on.
    pub fn banner_screen(&self) -> &str {
        self.screen.as_deref().unwrap_or("today")
    }

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
            if let Some(screen) = &self.screen
                && !BANNER_SCREENS.contains(&screen.as_str())
            {
                return Err(format!("screen must be one of {BANNER_SCREENS:?}"));
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
