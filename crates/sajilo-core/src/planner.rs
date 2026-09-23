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
    /// A monthly commitment (a report due on the 30th, rent on the 1st) keeps
    /// its Bikram Sambat day and is resolved again for each BS month. English
    /// months do not line up with BS ones, so an AD monthly repeat would land
    /// on a different BS day every time.
    MonthlyBikramSambat,
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
    /// Which day this plan falls on in the BS month `year`/`month`, if any.
    ///
    /// A repeating plan never occurs before the month it was created in, and
    /// its day is clamped to the month's real length: a plan on the 30th must
    /// still fire in a 29-day month, and one on the 32nd of a 32-day month in
    /// a year where that month has 30.
    pub fn occurrence_in(&self, year: i32, month: u32) -> Option<NepaliDate> {
        let repeats_in = match self.recurrence {
            Recurrence::None => {
                return (self.date.year == year && self.date.month == month).then_some(self.date);
            }
            Recurrence::MonthlyBikramSambat => true,
            Recurrence::YearlyBikramSambat => month == self.date.month,
        };
        if !repeats_in || (year, month) < (self.date.year, self.date.month) {
            return None;
        }
        let length = days_in_month(year, month)? as u32;
        Some(NepaliDate::new(year, month, self.date.day.min(length)))
    }

    pub fn occurs_on(&self, candidate: NepaliDate) -> bool {
        self.occurrence_in(candidate.year, candidate.month) == Some(candidate)
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

/// The days of the BS month `year`/`month` that have at least one plan,
/// ascending — what the month grid marks, repeats included.
pub fn plan_days_in_month(plans: &[DayPlan], year: i32, month: u32) -> Vec<u32> {
    let mut days: Vec<u32> = plans
        .iter()
        .filter_map(|plan| plan.occurrence_in(year, month))
        .map(|date| date.day)
        .collect();
    days.sort_unstable();
    days.dedup();
    days
}
