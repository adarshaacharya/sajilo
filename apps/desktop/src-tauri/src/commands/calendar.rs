//! Every calendar computation the UI needs.
//!
//! The frontend never converts a BS date itself. It asks for one here, so there
//! is exactly one implementation of the year-length table in the product and no
//! chance of a JavaScript copy drifting from it.

use sajilo_core::calendar::bikram_sambat as bs;
use sajilo_core::calendar::events::{CalendarEvent, events};
use sajilo_core::calendar::month::{CalendarMonth, month};
use sajilo_core::calendar::panchanga::{self, Panchanga};
use sajilo_core::calendar::upcoming::{self, UpcomingEvent};
use sajilo_core::{NepaliDate, nepal_time};
use serde::Serialize;

/// Errors cross the IPC boundary as strings, because that is all the webview
/// can receive. The typed error is preserved in the message.
type Result<T> = std::result::Result<T, String>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Today {
    pub nepali: NepaliDate,
    /// ISO, so the frontend can format it without owning a second calendar.
    pub gregorian: String,
    pub nepali_month_name: String,
    pub english_month_name: String,
    /// 0 = Sunday, matching the month grid's leading padding.
    pub weekday: u32,
}

/// The current date in Nepal — not in whatever zone the machine is set to.
/// A user in London must still see the Nepali day.
#[tauri::command]
pub fn today() -> Result<Today> {
    let gregorian = nepal_time::today();
    let nepali = bs::nepali_date_from(gregorian).map_err(|error| error.to_string())?;
    Ok(build_today(nepali, gregorian))
}

fn build_today(nepali: NepaliDate, gregorian: chrono::NaiveDate) -> Today {
    use chrono::Datelike;
    Today {
        nepali,
        gregorian: gregorian.to_string(),
        nepali_month_name: nepali.nepali_month_name().to_owned(),
        english_month_name: nepali.english_month_name().to_owned(),
        weekday: gregorian.weekday().num_days_from_sunday(),
    }
}

/// The month grid, padded so the 1st lands on its real weekday column.
#[tauri::command]
pub fn month_grid(year: i32, month_number: u32) -> Result<CalendarMonth> {
    let today = bs::nepali_date_from(nepal_time::today()).map_err(|e| e.to_string())?;
    month(NepaliDate::new(year, month_number, 1), today).map_err(|error| error.to_string())
}

/// The month `offset` months away from the given one. Kept in Rust because the
/// supported-range check belongs with the table it guards.
#[tauri::command]
pub fn shift_month(year: i32, month_number: u32, offset: i32) -> Result<NepaliDate> {
    bs::adding_months(offset, NepaliDate::new(year, month_number, 1))
        .map_err(|error| error.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversion {
    pub nepali: NepaliDate,
    pub gregorian: String,
    pub nepali_month_name: String,
    pub english_month_name: String,
    pub weekday: u32,
}

/// Bikram Sambat to Gregorian.
#[tauri::command]
pub fn bs_to_ad(year: i32, month_number: u32, day: u32) -> Result<Conversion> {
    let nepali = NepaliDate::new(year, month_number, day);
    let gregorian = bs::gregorian_date_from(nepali).map_err(|error| error.to_string())?;
    Ok(conversion(nepali, gregorian))
}

/// Gregorian to Bikram Sambat.
#[tauri::command]
pub fn ad_to_bs(year: i32, month_number: u32, day: u32) -> Result<Conversion> {
    let gregorian = chrono::NaiveDate::from_ymd_opt(year, month_number, day)
        .ok_or_else(|| "That is not a real Gregorian date.".to_owned())?;
    let nepali = bs::nepali_date_from(gregorian).map_err(|error| error.to_string())?;
    Ok(conversion(nepali, gregorian))
}

fn conversion(nepali: NepaliDate, gregorian: chrono::NaiveDate) -> Conversion {
    use chrono::Datelike;
    Conversion {
        nepali,
        gregorian: gregorian.to_string(),
        nepali_month_name: nepali.nepali_month_name().to_owned(),
        english_month_name: nepali.english_month_name().to_owned(),
        weekday: gregorian.weekday().num_days_from_sunday(),
    }
}

/// Festivals and tithi for one BS day.
#[tauri::command]
pub fn events_for(year: i32, month_number: u32, day: u32) -> Option<CalendarEvent> {
    events(year, month_number).get(&day).cloned()
}

/// Named festivals and holidays ahead of today.
#[tauri::command]
pub fn upcoming_events(
    limit: Option<usize>,
    horizon_days: Option<i64>,
) -> Result<Vec<UpcomingEvent>> {
    let today = bs::nepali_date_from(nepal_time::today()).map_err(|e| e.to_string())?;
    Ok(upcoming::events(
        today,
        limit.unwrap_or(upcoming::DEFAULT_LIMIT),
        horizon_days.unwrap_or(upcoming::DEFAULT_HORIZON_DAYS),
    ))
}

/// The range the bundled table actually covers, so the UI can bound its pickers
/// rather than letting someone scroll into an error.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportedRange {
    pub first_year: i32,
    pub last_year: i32,
    pub first_event_year: i32,
    pub last_event_year: i32,
}

/// Sunrise, sunset and Rahu Kaal for one Gregorian day — computed offline, so
/// every date in the calendar has them regardless of whether the weather
/// module is on or the network is reachable. `iso_date` is `YYYY-MM-DD`.
#[tauri::command]
pub fn panchanga_for(iso_date: String) -> Result<Panchanga> {
    let day = chrono::NaiveDate::parse_from_str(&iso_date, "%Y-%m-%d")
        .map_err(|_| "That is not a valid date.".to_owned())?;
    panchanga::panchanga_for(day)
        .ok_or_else(|| "The sun does not rise on this date at this location.".to_owned())
}

#[tauri::command]
pub fn supported_range() -> SupportedRange {
    use sajilo_core::calendar::events::{FIRST_EVENT_YEAR, LAST_EVENT_YEAR};
    SupportedRange {
        first_year: bs::FIRST_YEAR,
        last_year: bs::LAST_YEAR,
        first_event_year: FIRST_EVENT_YEAR,
        last_event_year: LAST_EVENT_YEAR,
    }
}
