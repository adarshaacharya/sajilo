//! What the tray actually shows.
//!
//! On macOS the tray can carry text beside the icon, which is how the Swift app
//! puts the Nepali date in the menu bar. Windows and Linux have no such thing —
//! there the day number is drawn into the icon itself (`tray/icon.rs`).

use sajilo_core::calendar::bikram_sambat as bs;
use sajilo_core::numerals::NumeralStyle;
use sajilo_core::{NepaliDate, nepal_time};
use serde::{Deserialize, Serialize};

/// The menu-bar formats offered in Settings, ported from `MenuBarFormat` in the
/// Swift app.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MenuBarFormat {
    /// `साउन ३१`
    NepaliShort,
    /// `साउन ३१, २०८३`
    #[default]
    NepaliLong,
    /// `🇳🇵 साउन ३१`
    NepaliFlag,
    /// `Aug 16` — already Latin by definition, and unaffected by the numeral
    /// setting.
    EnglishShort,
    /// `२०८३/०४/३१`
    Numeric,
    /// Built from the custom flag/year toggles.
    Custom,
}

/// The two switches under the Custom format — same keys as the Swift app.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CustomMenuBar {
    pub show_flag: bool,
    pub show_year: bool,
}

impl Default for CustomMenuBar {
    fn default() -> Self {
        Self {
            show_flag: true,
            show_year: true,
        }
    }
}

/// Renders the tray label for a given date.
///
/// Pure, and takes the date rather than reading the clock, so the midnight
/// rollover can be tested by moving the date instead of waiting for it.
pub fn title(
    date: NepaliDate,
    format: MenuBarFormat,
    numerals: NumeralStyle,
    custom: CustomMenuBar,
) -> String {
    let day = numerals.format(i64::from(date.day), None);
    let year = numerals.format(date.year, None);
    let month = date.nepali_month_name();

    match format {
        MenuBarFormat::NepaliShort => format!("{month} {day}"),
        MenuBarFormat::NepaliLong => format!("{month} {day}, {year}"),
        MenuBarFormat::Numeric => numerals.slashed_date(date),
        MenuBarFormat::NepaliFlag => format!("🇳🇵 {month} {day}"),
        // Deliberately ignores `numerals`: this format is Latin by definition,
        // and turning its month name into digits would be nonsense.
        MenuBarFormat::EnglishShort => {
            match bs::gregorian_date_from(date) {
                Ok(gregorian) => gregorian.format("%b %-d").to_string(),
                // Outside the bundled range there is no Gregorian date to show,
                // so fall back to something true rather than empty.
                Err(_) => date.english_month_name().to_owned(),
            }
        }
        MenuBarFormat::Custom => {
            let mut parts: Vec<String> = Vec::new();
            if custom.show_flag {
                parts.push("🇳🇵".to_owned());
            }
            parts.push(format!("{day} {month}"));
            if custom.show_year {
                parts.push(year);
            }
            parts.join(" ")
        }
    }
}

/// Seconds until the next midnight in Nepal.
///
/// The tray must roll over at Kathmandu midnight, not the machine's. Returning
/// a duration rather than sleeping keeps this testable.
pub fn seconds_until_nepal_midnight(now: chrono::DateTime<chrono::FixedOffset>) -> i64 {
    use chrono::Timelike;
    let seconds_today =
        i64::from(now.hour()) * 3600 + i64::from(now.minute()) * 60 + i64::from(now.second());
    // Never zero: a zero-length sleep would spin the timer at midnight.
    (86_400 - seconds_today).max(1)
}

/// Today in Nepal, for the tray to draw.
pub fn today() -> Option<NepaliDate> {
    bs::nepali_date_from(nepal_time::today()).ok()
}
