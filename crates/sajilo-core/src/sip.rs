//! Monthly SIP payments: which one is next for a fund, and the reminders for it.
//!
//! A SIP is paid on the same day of every Gregorian month — the day the bank
//! debits it. Everything here is pure: the day it is today comes in as an
//! argument, so every rule (a 31st in a 30-day month, a payment marked paid, a
//! day missed and still owed) is testable without waiting for a date.

use chrono::{Datelike, Duration, NaiveDate};
use serde::{Deserialize, Serialize};

use crate::calendar::bikram_sambat::nepali_date_from;
use crate::calendar::nepali_date::{NepaliDate, NepaliMonth};

/// How long a missed payment stays on screen, and keeps reminding, before the
/// schedule moves on to next month's.
pub const GRACE_DAYS: i64 = 2;

/// Existing schedules keep the original reminder timing when the configurable
/// field is first introduced.
pub const DEFAULT_REMIND_DAYS: [u32; 2] = [3, 0];

fn default_remind_days() -> Vec<u32> {
    DEFAULT_REMIND_DAYS.to_vec()
}

/// What the user set up for one fund. Stored on the device and read only by
/// Rust, so it has no TypeScript binding: the UI sees `SipStatus`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SipPlan {
    pub symbol: String,
    /// The fund's name when the SIP was set, so a reminder can name it without
    /// the fund list at hand.
    pub name: String,
    /// Day of the month, 1–31. A month too short for it pays on its last day.
    pub day: u32,
    /// Rupees a month, when the user gave it.
    #[serde(default)]
    pub amount: Option<f64>,
    /// Days before the payment to notify. Zero means the payment day itself.
    #[serde(default = "default_remind_days")]
    pub remind_days: Vec<u32>,
    /// `YYYY-MM` of the latest payment marked paid.
    #[serde(default)]
    pub paid_month: Option<String>,
    /// ISO date to remind again on, after "remind me tomorrow".
    #[serde(default)]
    pub remind_on: Option<String>,
}

/// Where one fund's schedule stands today.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct SipStatus {
    pub symbol: String,
    pub name: String,
    pub day: u32,
    pub amount: Option<f64>,
    /// ISO date of the payment this status is about: the next one, or one
    /// missed within the last `GRACE_DAYS` days.
    pub due: String,
    /// The same day in Bikram Sambat, when it is inside the bundled calendar.
    pub due_bs: Option<NepaliDate>,
    /// e.g. `Ashwin`.
    pub due_bs_month: Option<String>,
    /// e.g. `असोज`.
    pub due_bs_month_ne: Option<String>,
    /// Days from today to `due`. Negative once it has been missed.
    pub days: i32,
    pub remind_days: Vec<u32>,
}

impl SipStatus {
    /// Close enough to show: inside the earliest chosen warning, or already due.
    pub fn is_close(&self) -> bool {
        self.days <= self.remind_days.iter().copied().max().unwrap_or(0) as i32
    }
}

/// `day` of that month, or the month's last day when it is shorter.
pub fn due_in_month(year: i32, month: u32, day: u32) -> Option<NaiveDate> {
    let day = day.clamp(1, 31);
    (1..=day)
        .rev()
        .find_map(|candidate| NaiveDate::from_ymd_opt(year, month, candidate))
}

pub fn month_key(date: NaiveDate) -> String {
    format!("{:04}-{:02}", date.year(), date.month())
}

fn shift_month(year: i32, month: u32, by: i32) -> (i32, u32) {
    let index = year * 12 + month as i32 - 1 + by;
    (index.div_euclid(12), index.rem_euclid(12) as u32 + 1)
}

/// The payment the plan is about today: last month's or this month's while it
/// is unpaid and within grace, otherwise the next one.
pub fn current_due(plan: &SipPlan, today: NaiveDate) -> Option<NaiveDate> {
    (-1..=2).find_map(|offset| {
        let (year, month) = shift_month(today.year(), today.month(), offset);
        let due = due_in_month(year, month, plan.day)?;
        let paid = plan.paid_month.as_deref() == Some(month_key(due).as_str());
        (!paid && due >= today - Duration::days(GRACE_DAYS)).then_some(due)
    })
}

pub fn status(plan: &SipPlan, today: NaiveDate) -> Option<SipStatus> {
    let due = current_due(plan, today)?;
    let bs = nepali_date_from(due).ok();
    let month = bs.and_then(|date| NepaliMonth::from_number(date.month));
    Some(SipStatus {
        symbol: plan.symbol.clone(),
        name: plan.name.clone(),
        day: plan.day,
        amount: plan.amount,
        due: due.to_string(),
        due_bs: bs,
        due_bs_month: month.map(|month| month.english_name().to_owned()),
        due_bs_month_ne: month.map(|month| month.nepali_name().to_owned()),
        days: (due - today).num_days() as i32,
        remind_days: plan.remind_days.clone(),
    })
}

/// Every plan's status, soonest payment first.
pub fn statuses(plans: &[SipPlan], today: NaiveDate) -> Vec<SipStatus> {
    let mut all: Vec<SipStatus> = plans
        .iter()
        .filter_map(|plan| status(plan, today))
        .collect();
    all.sort_by(|a, b| a.days.cmp(&b.days).then_with(|| a.name.cmp(&b.name)));
    all
}

/// Marks the payment `today` is about as paid, so its reminders stop.
pub fn mark_paid(plan: &mut SipPlan, today: NaiveDate) {
    if let Some(due) = current_due(plan, today) {
        plan.paid_month = Some(month_key(due));
        plan.remind_on = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plan(day: u32) -> SipPlan {
        SipPlan {
            symbol: "NIBLSF".into(),
            name: "NIBL Sahabhagita Fund".into(),
            day,
            amount: Some(5_000.0),
            remind_days: DEFAULT_REMIND_DAYS.to_vec(),
            paid_month: None,
            remind_on: None,
        }
    }

    fn date(text: &str) -> NaiveDate {
        text.parse().unwrap()
    }

    #[test]
    fn a_day_past_the_end_of_the_month_pays_on_its_last_day() {
        assert_eq!(due_in_month(2026, 2, 31), Some(date("2026-02-28")));
        assert_eq!(due_in_month(2028, 2, 31), Some(date("2028-02-29")));
        assert_eq!(due_in_month(2026, 9, 31), Some(date("2026-09-30")));
        assert_eq!(due_in_month(2026, 10, 31), Some(date("2026-10-31")));
    }

    #[test]
    fn the_next_payment_is_this_month_until_it_passes() {
        let status = status(&plan(15), date("2026-09-12")).unwrap();
        assert_eq!(status.due, "2026-09-15");
        assert_eq!(status.days, 3);
        assert!(status.is_close());
        assert_eq!(status.due_bs_month.as_deref(), Some("Bhadra"));
        assert_eq!(status.due_bs_month_ne.as_deref(), Some("भदौ"));
    }

    #[test]
    fn existing_plans_keep_the_original_reminder_days() {
        let saved = serde_json::json!({
            "symbol": "NIBLSF",
            "name": "NIBL Sahabhagita Fund",
            "day": 15,
            "amount": 5000
        });
        let plan: SipPlan = serde_json::from_value(saved).unwrap();
        assert_eq!(plan.remind_days, DEFAULT_REMIND_DAYS);
    }

    #[test]
    fn the_earliest_chosen_reminder_controls_when_a_payment_is_close() {
        let mut sip = plan(15);
        sip.remind_days = vec![7, 0];
        assert!(status(&sip, date("2026-09-08")).unwrap().is_close());
        assert!(!status(&sip, date("2026-09-07")).unwrap().is_close());
    }

    #[test]
    fn a_missed_payment_stays_owed_for_the_grace_days_then_moves_on() {
        let late = status(&plan(15), date("2026-09-17")).unwrap();
        assert_eq!((late.due.as_str(), late.days), ("2026-09-15", -2));
        let moved = status(&plan(15), date("2026-09-18")).unwrap();
        assert_eq!((moved.due.as_str(), moved.days), ("2026-10-15", 27));
        assert!(!moved.is_close());
    }

    #[test]
    fn a_payment_missed_at_the_end_of_last_month_is_still_owed_early_this_month() {
        let status = status(&plan(31), date("2026-09-01")).unwrap();
        assert_eq!((status.due.as_str(), status.days), ("2026-08-31", -1));
    }

    #[test]
    fn marking_paid_moves_the_schedule_to_next_month() {
        let mut sip = plan(15);
        sip.remind_on = Some("2026-09-16".into());
        mark_paid(&mut sip, date("2026-09-15"));
        assert_eq!(sip.paid_month.as_deref(), Some("2026-09"));
        assert_eq!(sip.remind_on, None);
        assert_eq!(status(&sip, date("2026-09-15")).unwrap().due, "2026-10-15");
    }

    #[test]
    fn paying_early_skips_this_months_payment() {
        let mut sip = plan(15);
        mark_paid(&mut sip, date("2026-09-13"));
        assert_eq!(status(&sip, date("2026-09-14")).unwrap().due, "2026-10-15");
    }

    #[test]
    fn statuses_come_soonest_first() {
        let mut later = plan(28);
        later.symbol = "NFCF".into();
        later.name = "Nabil Flexi Cap Fund".into();
        let all = statuses(&[later, plan(15)], date("2026-09-12"));
        assert_eq!(
            all.iter().map(|s| s.symbol.as_str()).collect::<Vec<_>>(),
            ["NIBLSF", "NFCF"]
        );
    }
}
