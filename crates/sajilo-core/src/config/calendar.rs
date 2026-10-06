//! Corrections to the bundled calendar: `data/config/calendar.json`.
//!
//! The government moves holidays and changes weekly-holiday rules with a
//! week's notice. This pack carries the Sunday rule and per-day patches
//! laid over the bundled event files. It can only correct days inside the
//! bundled range; it cannot invent years the engine has no table for.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use super::check::optional_text;
use super::{Pack, Slot};
use crate::calendar::events::{FIRST_EVENT_YEAR, LAST_EVENT_YEAR};

const MAX_PATCHES: usize = 400;
const MAX_NAME: usize = 120;

/// Sunday as a weekly holiday, from one date to (optionally) another.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SundayRule {
    pub from: NaiveDate,
    #[serde(default)]
    pub until: Option<NaiveDate>,
}

/// One BS day's correction. A field left out keeps the bundled value; an
/// empty `name` or `tithi` clears it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EventPatch {
    pub year: i32,
    pub month: u32,
    pub day: u32,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub tithi: Option<String>,
    #[serde(default)]
    pub holiday: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CalendarPack {
    /// `None`: Sunday is never a holiday.
    pub sunday: Option<SundayRule>,
    #[serde(default)]
    pub events: Vec<EventPatch>,
}

impl CalendarPack {
    pub fn patches(&self, year: i32, month: u32) -> impl Iterator<Item = &EventPatch> {
        self.events
            .iter()
            .filter(move |patch| patch.year == year && patch.month == month)
    }
}

impl Pack for CalendarPack {
    const NAME: &'static str = "calendar";
    const SCHEMA: u32 = 1;

    fn bundled_json() -> &'static str {
        include_str!("../../../../data/config/calendar.json")
    }

    fn validate(&self) -> Result<(), String> {
        if let Some(rule) = self.sunday
            && rule.until.is_some_and(|until| until < rule.from)
        {
            return Err("sunday.until is before sunday.from".to_owned());
        }
        if self.events.len() > MAX_PATCHES {
            return Err(format!("more than {MAX_PATCHES} event patches"));
        }
        for (index, patch) in self.events.iter().enumerate() {
            let field = format!("events[{index}]");
            if !(FIRST_EVENT_YEAR..=LAST_EVENT_YEAR).contains(&patch.year) {
                return Err(format!("{field}.year is outside the bundled calendar"));
            }
            if !(1..=12).contains(&patch.month) || !(1..=32).contains(&patch.day) {
                return Err(format!("{field} is not a BS date"));
            }
            let length = crate::calendar::bikram_sambat::days_in_month(patch.year, patch.month);
            if length.is_none_or(|length| patch.day as i32 > length) {
                return Err(format!("{field} is not a day in that month"));
            }
            if let Some(name) = &patch.name {
                optional_text(&format!("{field}.name"), name, MAX_NAME)?;
            }
            if let Some(tithi) = &patch.tithi {
                optional_text(&format!("{field}.tithi"), tithi, MAX_NAME)?;
            }
        }
        Ok(())
    }

    fn slot() -> &'static Slot<Self> {
        static SLOT: Slot<CalendarPack> = Slot::new();
        &SLOT
    }
}
