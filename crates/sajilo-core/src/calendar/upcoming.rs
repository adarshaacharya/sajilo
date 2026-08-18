//! Named festivals and public holidays ahead of today. Ported from
//! `UpcomingEventsService.swift`.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use crate::calendar::bikram_sambat::{
    adding_months, days_in_month, gregorian_date_from, is_supported_year,
};
use crate::calendar::events;
use crate::calendar::nepali_date::NepaliDate;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpcomingEvent {
    pub date: NepaliDate,
    pub gregorian: NaiveDate,
    pub name: String,
    pub is_public_holiday: bool,
    /// Whole days from today. 0 is today, 1 tomorrow.
    pub days_away: i64,
}

/// Defaults matching `UpcomingEventsService.events(from:)` in Swift.
pub const DEFAULT_LIMIT: usize = 12;
pub const DEFAULT_HORIZON_DAYS: i64 = 400;

impl UpcomingEvent {
    pub fn id(&self) -> String {
        format!(
            "{}-{}-{}-{}",
            self.date.year, self.date.month, self.date.day, self.name
        )
    }

    pub fn relative_text(&self) -> String {
        match self.days_away {
            0 => "Today".to_owned(),
            1 => "Tomorrow".to_owned(),
            days => format!("in {days} days"),
        }
    }
}

/// Presentation filters for the Events route. The service supplies one complete
/// ordered list; these only decide which part of it is shown.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UpcomingEventFilter {
    Current,
    Festivals,
    PublicHolidays,
}

impl UpcomingEventFilter {
    pub fn includes(self, event: &UpcomingEvent) -> bool {
        match self {
            // Today plus the next six days keeps this a useful near-term view.
            Self::Current => event.days_away < 7,
            // Every item already has a named cultural, religious or civic event.
            Self::Festivals => true,
            Self::PublicHolidays => event.is_public_holiday,
        }
    }
}

/// Walks forward month by month from `today`.
///
/// Only days carrying a name are returned. Plain Saturdays are public holidays
/// in Nepal but appear 52 times a year, so listing them would bury the
/// festivals this is meant to surface.
pub fn events(today: NepaliDate, limit: usize, horizon_days: i64) -> Vec<UpcomingEvent> {
    let Ok(today_gregorian) = gregorian_date_from(today) else {
        return Vec::new();
    };

    let mut results = Vec::new();
    let mut cursor = NepaliDate::new(today.year, today.month, 1);

    while results.len() < limit {
        if !is_supported_year(cursor.year) {
            break;
        }
        let Some(day_count) = days_in_month(cursor.year, cursor.month) else {
            break;
        };

        let month_events = events::events(cursor.year, cursor.month);

        for day in 1..=day_count as u32 {
            let Some(event) = month_events.get(&day) else {
                continue;
            };
            let Some(name) = event.name.as_deref() else {
                continue;
            };

            let date = NepaliDate::new(cursor.year, cursor.month, day);
            if date < today {
                continue;
            }
            let Ok(gregorian) = gregorian_date_from(date) else {
                continue;
            };

            let days_away = (gregorian - today_gregorian).num_days();
            // The list is chronological, so the first date past the horizon
            // ends the walk rather than merely being skipped.
            if days_away > horizon_days {
                return results;
            }

            results.push(UpcomingEvent {
                date,
                gregorian,
                name: name.to_owned(),
                is_public_holiday: event.is_public_holiday,
                days_away,
            });
            if results.len() >= limit {
                return results;
            }
        }

        let Ok(next) = adding_months(1, cursor) else {
            break;
        };
        cursor = next;
    }

    results
}
