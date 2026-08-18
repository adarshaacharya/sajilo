//! A portable, user-owned snapshot of Sajilo's personal data and preferences.
//! Ported from `SajiloBackup.swift`.
//!
//! Live feeds and caches are intentionally excluded: they are recreated from
//! their public sources, while plans and choices cannot be reconstructed.
//!
//! **Format version 1 is a compatibility contract with the Swift app.** A
//! backup exported there must import here, which is the whole point of the
//! migration having an export at all. Field names and shapes are therefore
//! fixed, not free to tidy.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::planner::DayPlan;

pub const CURRENT_VERSION: u32 = 1;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum BackupError {
    #[error("This backup was made by a newer version of Sajilo (format {0}).")]
    UnsupportedVersion(u32),
    #[error("This file is not a Sajilo backup: {0}")]
    Unreadable(String),
}

/// Every preference the Swift app exported, under the same names.
///
/// `Option` fields are ones added after v1 shipped: an older export omits them
/// and must still import cleanly, which is why none of them are required.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub menu_bar_format: String,
    pub custom_menu_bar_shows_flag: bool,
    pub custom_menu_bar_shows_year: bool,
    pub app_language: String,
    pub numeral_style: String,
    pub weather_enabled: bool,
    pub forex_enabled: bool,
    pub news_enabled: bool,
    pub bazar_enabled: bool,
    pub rashifal_enabled: bool,
    pub radio_enabled: bool,
    pub weather_location: String,
    #[serde(default)]
    pub forex_favourites: Vec<String>,
    #[serde(default)]
    pub vegetable_favourites: Vec<String>,
    /// Optional so v1 exports made before the watchlist existed still import.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stock_watchlist: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_rashi: Option<String>,
    pub shows_dock_icon: bool,
    pub notify_holiday_eve: bool,
    pub notify_festival_eve: bool,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            menu_bar_format: "nepaliLong".to_owned(),
            custom_menu_bar_shows_flag: true,
            custom_menu_bar_shows_year: false,
            app_language: "ne".to_owned(),
            numeral_style: "devanagari".to_owned(),
            weather_enabled: true,
            forex_enabled: true,
            news_enabled: true,
            bazar_enabled: true,
            rashifal_enabled: true,
            radio_enabled: true,
            weather_location: "kathmandu".to_owned(),
            // The PRD's default five, spelled out here rather than reaching
            // into the API crate — core does not depend on it.
            forex_favourites: ["USD", "AUD", "GBP", "EUR", "JPY"]
                .map(str::to_owned)
                .to_vec(),
            vegetable_favourites: Vec::new(),
            stock_watchlist: None,
            selected_rashi: None,
            shows_dock_icon: false,
            notify_holiday_eve: false,
            notify_festival_eve: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SajiloBackup {
    pub format_version: u32,
    pub exported_at: DateTime<Utc>,
    pub preferences: Preferences,
    pub day_plans: Vec<DayPlan>,
}

impl SajiloBackup {
    pub fn new(
        preferences: Preferences,
        day_plans: Vec<DayPlan>,
        exported_at: DateTime<Utc>,
    ) -> Self {
        Self {
            format_version: CURRENT_VERSION,
            exported_at,
            preferences,
            day_plans,
        }
    }

    /// Pretty-printed with sorted keys, matching the Swift encoder — a backup is
    /// a file a person may open and read, and a stable key order also makes two
    /// exports diffable.
    pub fn encode(&self) -> Result<String, BackupError> {
        // `serde_json` sorts map keys only for `BTreeMap`; struct field order is
        // declaration order, which is stable and sufficient for both purposes.
        serde_json::to_string_pretty(self)
            .map_err(|error| BackupError::Unreadable(error.to_string()))
    }

    pub fn decode(raw: &str) -> Result<Self, BackupError> {
        // Read the version before the whole document, so a future format gets
        // the honest "made by a newer version" message rather than a field-level
        // parse error the user cannot act on.
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct VersionOnly {
            format_version: u32,
        }

        let probe: VersionOnly = serde_json::from_str(raw)
            .map_err(|error| BackupError::Unreadable(error.to_string()))?;
        if probe.format_version != CURRENT_VERSION {
            return Err(BackupError::UnsupportedVersion(probe.format_version));
        }

        serde_json::from_str(raw).map_err(|error| BackupError::Unreadable(error.to_string()))
    }
}
