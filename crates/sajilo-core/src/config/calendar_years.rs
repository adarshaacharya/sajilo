//! Festival data for years after the bundled range:
//! `data/config/calendar-years.json`.
//!
//! The almanac for a new BS year comes out months before it starts. This
//! pack carries it to every installed app the day it's published, in the
//! same shape as `data/calendar-events/<year>/<month>.json`; the next
//! release then moves the year into the bundled files and out of here.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::check::optional_text;
use super::{Pack, Slot};
use crate::calendar::bikram_sambat::LAST_YEAR;
use crate::calendar::events::{LAST_EVENT_YEAR, MonthPayload};

/// Two new years at most: one coming up, one being prepared. Older ones
/// belong in the bundled files.
const MAX_YEARS: usize = 2;
const MAX_DAYS: usize = 40;
const MAX_FESTIVAL: usize = 200;
const MAX_TITHI: usize = 60;
const MAX_SAAIT: usize = 300;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct CalendarYearsPack {
    /// Twelve months per BS year, keyed by the year as text (`"2084"`).
    pub years: BTreeMap<String, Vec<MonthPayload>>,
}

impl CalendarYearsPack {
    pub fn month(&self, year: i32, month: u32) -> Option<&MonthPayload> {
        let months = self.years.get(&year.to_string())?;
        months.get(month.checked_sub(1)? as usize)
    }

    pub fn last_year(&self) -> Option<i32> {
        self.years.keys().filter_map(|year| year.parse().ok()).max()
    }
}

impl Pack for CalendarYearsPack {
    const NAME: &'static str = "calendar-years";
    const SCHEMA: u32 = 1;

    fn bundled_json() -> &'static str {
        include_str!("../../../../data/config/calendar-years.json")
    }

    fn validate(&self) -> Result<(), String> {
        if self.years.len() > MAX_YEARS {
            return Err(format!("more than {MAX_YEARS} years"));
        }
        for (key, months) in &self.years {
            let year: i32 = key
                .parse()
                .map_err(|_| format!("years.{key} is not a year"))?;
            if year <= LAST_EVENT_YEAR {
                return Err(format!(
                    "years.{key} is already bundled; correct it in calendar.json"
                ));
            }
            if year > LAST_YEAR {
                return Err(format!(
                    "years.{key} is past the calendar engine's {LAST_YEAR}"
                ));
            }
            if months.len() != 12 {
                return Err(format!("years.{key} has {} months, not 12", months.len()));
            }
            for (index, month) in months.iter().enumerate() {
                let field = format!("years.{key}[{index}]");
                if month.days.len() > MAX_DAYS {
                    return Err(format!("{field} has more than {MAX_DAYS} days"));
                }
                for day in &month.days {
                    optional_text(&format!("{field}.f"), &day.festival, MAX_FESTIVAL)?;
                    optional_text(&format!("{field}.t"), &day.tithi, MAX_TITHI)?;
                    optional_text(&format!("{field}.n"), &day.nepali_day, 4)?;
                }
                for line in month.marriage.iter().chain(&month.bratabandha) {
                    optional_text(&format!("{field} saait"), line, MAX_SAAIT)?;
                }
            }
        }
        Ok(())
    }

    fn slot() -> &'static Slot<Self> {
        static SLOT: Slot<CalendarYearsPack> = Slot::new();
        &SLOT
    }
}
