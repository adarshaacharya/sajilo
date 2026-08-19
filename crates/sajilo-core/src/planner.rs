//! Day plans: small personal commitments attached to a Bikram Sambat day.
//! Ported from `DayPlan.swift`.
//!
//! Deliberately not a general note document — no folders, rich text,
//! attachments or arbitrary recurrence. It answers one question well: what do I
//! need to remember on this date?

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::calendar::bikram_sambat::days_in_month;
use crate::calendar::nepali_date::NepaliDate;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Recurrence {
    #[default]
    None,
    /// A yearly important date keeps its Bikram Sambat month and day, and is
    /// resolved again for each year rather than pre-creating duplicate plans.
    YearlyBikramSambat,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct PlanTime {
    pub hour: u32,
    pub minute: u32,
}

/// How long before the plan's time to notify. Minutes, so `0` is "at the time".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Reminder(pub u32);

impl Reminder {
    /// The offsets offered in the editor.
    pub const CHOICES: [u32; 6] = [0, 5, 10, 15, 30, 60];
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayPlan {
    pub id: String,
    pub date: NepaliDate,
    pub title: String,
    pub time: Option<PlanTime>,
    pub reminder: Option<Reminder>,
    #[serde(default)]
    pub note: String,
    /// Absent in plans written before recurrence existed, so decoding defaults
    /// it to `None` and every existing plan stays one-time.
    #[serde(default)]
    pub recurrence: Recurrence,
    pub created_at: DateTime<Utc>,
}

impl DayPlan {
    /// Which day this plan falls on in `year`, if it recurs at all.
    ///
    /// The day is clamped to the month's real length: a plan on the 32nd of a
    /// 32-day month must still fire in a year where that month has 30.
    pub fn occurrence(&self, year: i32) -> Option<NepaliDate> {
        if self.recurrence != Recurrence::YearlyBikramSambat || year < self.date.year {
            return None;
        }
        let length = days_in_month(year, self.date.month)? as u32;
        Some(NepaliDate::new(
            year,
            self.date.month,
            self.date.day.min(length),
        ))
    }

    pub fn occurs_on(&self, candidate: NepaliDate) -> bool {
        match self.recurrence {
            Recurrence::None => self.date == candidate,
            Recurrence::YearlyBikramSambat => self.occurrence(candidate.year) == Some(candidate),
        }
    }

    /// A reminder without a time has nothing to count back from, so the two are
    /// kept consistent at the one place plans are built.
    pub fn normalised(mut self) -> Self {
        if self.time.is_none() {
            self.reminder = None;
        }
        self
    }
}

/// Timed plans first in clock order, then untimed ones, oldest first within a
/// tie. Stable so a re-render cannot reshuffle the list.
pub fn ordered(plans: &mut [DayPlan]) {
    plans.sort_by(|left, right| match (left.time, right.time) {
        (Some(a), Some(b)) => a.cmp(&b).then(left.created_at.cmp(&right.created_at)),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => left.created_at.cmp(&right.created_at),
    });
}

/// Every plan falling on `date`, ordered for display.
pub fn plans_on(plans: &[DayPlan], date: NepaliDate) -> Vec<DayPlan> {
    let mut matching: Vec<DayPlan> = plans
        .iter()
        .filter(|plan| plan.occurs_on(date))
        .cloned()
        .collect();
    ordered(&mut matching);
    matching
}
