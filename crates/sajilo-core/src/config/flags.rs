//! Kill switches: `data/config/flags.json`.
//!
//! A remote feed whose upstream broke can be paused without a release. A
//! paused feed is not fetched; it keeps showing its last good value,
//! labelled stale, or the reason it is paused. Only remote feeds can be
//! paused — the calendar, converter, tools, notes and plans are offline and
//! no pack can reach them.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::check::Bilingual;
use super::{Pack, Slot};

/// The remote modules a pause can name, as the first segment of a feed's
/// cache key (`bazar.metals.v1` → `bazar`).
pub const REMOTE_MODULES: [&str; 14] = [
    "announcement",
    "bazar",
    "crypto",
    "dividends",
    "forex",
    "ipos",
    "mutualFunds",
    "nepseIntraday",
    "news",
    "radio",
    "rashifal",
    "stocks",
    "stocksLive",
    "weather",
];

const MAX_PAUSES: usize = 64;
const MAX_REASON: usize = 160;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct FlagsPack {
    /// What is paused and why, by module (`news`) or feed (`bazar.metals`).
    pub paused: BTreeMap<String, Bilingual>,
}

/// A cache key without its version suffix: `bazar.metals.v1` →
/// `bazar.metals`, `weather.kathmandu.v1` → `weather.kathmandu`.
pub fn feed_name(cache_key: &str) -> &str {
    match cache_key.rsplit_once('.') {
        Some((head, tail))
            if tail.len() > 1
                && tail.starts_with('v')
                && tail[1..].chars().all(|c| c.is_ascii_digit()) =>
        {
            head
        }
        _ => cache_key,
    }
}

impl FlagsPack {
    /// Why the feed under `cache_key` is paused, if it is: by its own name
    /// first, then by its module.
    pub fn pause_for(&self, cache_key: &str) -> Option<&Bilingual> {
        let name = feed_name(cache_key);
        let module = name.split('.').next().unwrap_or(name);
        self.paused.get(name).or_else(|| self.paused.get(module))
    }
}

impl Pack for FlagsPack {
    const NAME: &'static str = "flags";
    const SCHEMA: u32 = 1;

    fn bundled_json() -> &'static str {
        include_str!("../../../../data/config/flags.json")
    }

    fn validate(&self) -> Result<(), String> {
        if self.paused.len() > MAX_PAUSES {
            return Err(format!("more than {MAX_PAUSES} pauses"));
        }
        for (name, reason) in &self.paused {
            let module = name.split('.').next().unwrap_or_default();
            if !REMOTE_MODULES.contains(&module) {
                return Err(format!("paused.{name} is not a remote module"));
            }
            if name.len() > 64
                || !name
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
            {
                return Err(format!("paused.{name} is not a feed name"));
            }
            reason.check(&format!("paused.{name}"), MAX_REASON)?;
        }
        Ok(())
    }

    fn slot() -> &'static Slot<Self> {
        static SLOT: Slot<FlagsPack> = Slot::new();
        &SLOT
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_only_a_version_suffix() {
        assert_eq!(feed_name("bazar.metals.v1"), "bazar.metals");
        assert_eq!(feed_name("news.v3"), "news");
        assert_eq!(feed_name("weather.kathmandu.v1"), "weather.kathmandu");
        assert_eq!(
            feed_name("dismissedAnnouncements"),
            "dismissedAnnouncements"
        );
        assert_eq!(feed_name("a.vx"), "a.vx");
    }

    #[test]
    fn a_feed_pause_beats_its_module() {
        let reason = |en: &str| Bilingual {
            en: en.into(),
            ne: en.into(),
        };
        let pack = FlagsPack {
            paused: [
                ("bazar".to_owned(), reason("all")),
                ("bazar.fuel".to_owned(), reason("fuel")),
            ]
            .into(),
        };
        assert_eq!(pack.pause_for("bazar.fuel.v1").unwrap().en, "fuel");
        assert_eq!(pack.pause_for("bazar.metals.v1").unwrap().en, "all");
        assert!(pack.pause_for("news.v3").is_none());
    }

    #[test]
    fn offline_modules_cannot_be_paused() {
        let json = r#"{"paused":{"calendar":{"en":"x","ne":"x"}}}"#;
        assert!(FlagsPack::parse(json).is_err());
    }
}
