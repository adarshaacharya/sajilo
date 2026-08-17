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
    /// `साउन ३१, २०८३`
    #[default]
    NepaliLong,
    /// `२०८३/०४/३१`
    Numeric,
    /// `🇳🇵 साउन ३१`
    NepaliFlag,
    /// `Aug 16` — already Latin by definition, and unaffected by the numeral
    /// setting.
    EnglishShort,
}

/// Renders the tray label for a given date.
///
/// Pure, and takes the date rather than reading the clock, so the midnight
/// rollover can be tested by moving the date instead of waiting for it.
pub fn title(date: NepaliDate, format: MenuBarFormat, numerals: NumeralStyle) -> String {
    match format {
        MenuBarFormat::NepaliLong => format!(
            "{} {}, {}",
            date.nepali_month_name(),
            numerals.format(i64::from(date.day), None),
            numerals.format(date.year, None)
        ),
        MenuBarFormat::Numeric => numerals.slashed_date(date),
        MenuBarFormat::NepaliFlag => format!(
            "🇳🇵 {} {}",
            date.nepali_month_name(),
            numerals.format(i64::from(date.day), None)
        ),
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
