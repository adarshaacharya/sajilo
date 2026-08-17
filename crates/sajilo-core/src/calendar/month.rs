//! Month grid for the calendar UI. Ported from `CalendarMonth.swift` and
//! `BikramSambatCalendar.month(containing:today:)`.

use chrono::{Datelike, Weekday};
use serde::{Deserialize, Serialize};

use crate::calendar::bikram_sambat::{days_in_month, gregorian_date_from};
use crate::calendar::events;
use crate::calendar::nepali_date::NepaliDate;
use crate::error::{ConversionError, Result};
use crate::numerals::devanagari;

/// One cell of the grid. Leading cells before the 1st carry no date.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CalendarDay {
    pub id: String,
    pub date: Option<NepaliDate>,
    pub ad_day: Option<u32>,
    pub is_today: bool,
    pub is_holiday: bool,
    pub event_name: Option<String>,
    pub tithi: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CalendarMonth {
    pub first_date: NepaliDate,
    pub title: String,
    pub days: Vec<CalendarDay>,
}

/// The grid for the month containing `date`, padded so the 1st lands on its
/// real weekday column. `today` is passed in rather than read from the clock so
/// the grid stays a pure function.
pub fn month(date: NepaliDate, today: NepaliDate) -> Result<CalendarMonth> {
    let number_of_days =
        days_in_month(date.year, date.month).ok_or(ConversionError::UnsupportedNepaliDate)?;
    let first_date = NepaliDate::new(date.year, date.month, 1);
    let first_gregorian = gregorian_date_from(first_date)?;
    let leading = first_gregorian.weekday().num_days_from_sunday();
    let source_events = events::events(date.year, date.month);

    let mut days: Vec<CalendarDay> = (0..leading)
        .map(|offset| CalendarDay {
            id: format!("blank-{}-{}-{offset}", date.year, date.month),
            date: None,
            ad_day: None,
            is_today: false,
            is_holiday: false,
            event_name: None,
            tithi: None,
        })
        .collect();

    for day in 1..=number_of_days as u32 {
        let bs_date = NepaliDate::new(date.year, date.month, day);
        let ad_date = gregorian_date_from(bs_date).ok();
        let event = source_events.get(&day);
        days.push(CalendarDay {
            id: format!("{}-{}-{day}", date.year, date.month),
            date: Some(bs_date),
            ad_day: ad_date.map(|d| d.day()),
            is_today: bs_date == today,
            // Saturday is Nepal's weekly holiday; the source data flags the rest.
            is_holiday: ad_date.is_some_and(|d| d.weekday() == Weekday::Sat)
                || event.is_some_and(|e| e.is_public_holiday),
            event_name: event.and_then(|e| e.name.clone()),
            tithi: event.and_then(|e| e.tithi.clone()),
        });
    }

    Ok(CalendarMonth {
        first_date,
        title: format!(
            "{} {}",
            first_date.nepali_month_name(),
            devanagari(date.year, None)
        ),
        days,
    })
}
