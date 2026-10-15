//! The electricity bill's calendar: what paying today costs, and when to say
//! so.
//!
//! Nepal Electricity Authority bills from the meter reading, and the bill
//! date is that reading. Its tariff-collection rules count from it: paid
//! within [`REBATE_DAYS`] days, a [`REBATE_PERCENT`]% rebate; up to
//! [`NORMAL_DAYS`] days, the amount as billed; after that a penalty; and past
//! [`DISCONNECT_DAYS`] days the line may be cut without notice. The penalty's
//! steps are not published anywhere reliable, so no percentage is claimed
//! for them.
//!
//! Pure: the bill rows come from the shell's cache, the clock from the caller.

use chrono::{DateTime, Duration, NaiveDate, Utc};

use crate::nepal_time;
use crate::notify::{LIMIT, PlannedNotification, ReminderKind, at_nepal_time, still_deliverable};
use crate::tools::units::grouped_decimal;

/// Paid within this many days of the meter reading: the rebate applies.
pub const REBATE_DAYS: i64 = 7;
pub const REBATE_PERCENT: f64 = 2.0;
/// Up to this many days: the amount as billed. Later: a penalty.
pub const NORMAL_DAYS: i64 = 22;
/// Past this many days the line can be cut without notice.
pub const DISCONNECT_DAYS: i64 = 60;
/// Bill reminders go out at 9:00, Nepal time: early enough to pay that day.
pub const REMINDER_HOUR: u32 = 9;

/// Where an unpaid bill stands on a given day.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stage {
    /// The rebate applies through `until`.
    Rebate { until: NaiveDate },
    /// The billed amount applies through `until`; a penalty after.
    Normal { until: NaiveDate },
    /// A penalty applies; the line may be cut after `cut_after`.
    Penalty { cut_after: NaiveDate },
    /// Past the point the line may be cut.
    Disconnection,
}

/// Where a bill read on `bill_date` stands on `today`. Day 1 is the reading
/// day itself, as the authority counts.
pub fn stage(bill_date: NaiveDate, today: NaiveDate) -> Stage {
    let last = |days: i64| bill_date + Duration::days(days - 1);
    if today <= last(REBATE_DAYS) {
        Stage::Rebate {
            until: last(REBATE_DAYS),
        }
    } else if today <= last(NORMAL_DAYS) {
        Stage::Normal {
            until: last(NORMAL_DAYS),
        }
    } else if today <= last(DISCONNECT_DAYS) {
        Stage::Penalty {
            cut_after: last(DISCONNECT_DAYS),
        }
    } else {
        Stage::Disconnection
    }
}

/// An unpaid bill, as much as reminders need.
#[derive(Debug, Clone, PartialEq)]
pub struct UnpaidBill {
    /// Stable per bill: its month as the authority names it, `Ashwin/2083`.
    pub month: String,
    pub bill_date: NaiveDate,
    /// What the bill says, before any rebate or penalty.
    pub amount: f64,
}

/// Up to three reminders per unpaid bill, each at [`REMINDER_HOUR`]: the day
/// it is read, the last day of the rebate, and the last day before the
/// penalty. Ones whose moment has passed are left out, so a bill found late
/// starts at whichever still helps.
pub fn plan(bills: &[UnpaidBill], now: DateTime<Utc>) -> Vec<PlannedNotification> {
    let mut all = Vec::new();
    for bill in bills {
        let amount = format!("Rs {}", grouped_decimal(bill.amount, 0));
        let rebate = grouped_decimal(bill.amount * (1.0 - REBATE_PERCENT / 100.0), 0);
        let key = format!("sajilo.nea.{}", bill.month.replace('/', "-"));
        let day = |days: i64| bill.bill_date + Duration::days(days - 1);
        for (date, suffix, title, body) in [
            (
                bill.bill_date,
                "new",
                format!("Electricity bill: {amount}"),
                format!(
                    "{} bill. Pay by {} for the {REBATE_PERCENT}% rebate (Rs {rebate}).",
                    bill.month,
                    day(REBATE_DAYS).format("%b %-d")
                ),
            ),
            (
                day(REBATE_DAYS),
                "rebate",
                "Last day for the electricity rebate".to_owned(),
                format!("{amount} bill: pay today and it's Rs {rebate}."),
            ),
            (
                day(NORMAL_DAYS),
                "penalty",
                "Electricity bill: last day before penalty".to_owned(),
                format!(
                    "{amount} for {}. A penalty is added from tomorrow.",
                    bill.month
                ),
            ),
        ] {
            if let Some(fire_at) = at_nepal_time(date, REMINDER_HOUR, 0)
                && still_deliverable(fire_at, now)
            {
                all.push(PlannedNotification {
                    id: format!("{key}.{suffix}"),
                    kind: ReminderKind::Keeper,
                    title,
                    body,
                    fire_at,
                });
            }
        }
    }
    all.sort_by_key(|notification| notification.fire_at);
    all.truncate(LIMIT);
    all
}

/// Today in Nepal, for callers that have only the instant.
pub fn nepal_today(now: DateTime<Utc>) -> NaiveDate {
    now.with_timezone(&nepal_time::offset()).date_naive()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn date(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    #[test]
    fn the_rebate_runs_seven_days_from_the_reading() {
        let read = date(2026, 10, 11);
        assert_eq!(
            stage(read, read),
            Stage::Rebate {
                until: date(2026, 10, 17)
            }
        );
        assert_eq!(
            stage(read, date(2026, 10, 17)),
            Stage::Rebate {
                until: date(2026, 10, 17)
            }
        );
        assert_eq!(
            stage(read, date(2026, 10, 18)),
            Stage::Normal {
                until: date(2026, 11, 1)
            }
        );
        assert_eq!(
            stage(read, date(2026, 11, 2)),
            Stage::Penalty {
                cut_after: date(2026, 12, 9)
            }
        );
        assert_eq!(stage(read, date(2026, 12, 10)), Stage::Disconnection);
    }

    #[test]
    fn three_reminders_for_a_new_bill_and_fewer_for_a_late_one() {
        let bill = UnpaidBill {
            month: "Ashwin/2083".into(),
            bill_date: date(2026, 10, 11),
            amount: 2611.0,
        };
        // The evening before the reading: all three are ahead.
        let before = Utc.with_ymd_and_hms(2026, 10, 10, 12, 0, 0).unwrap();
        let planned = plan(std::slice::from_ref(&bill), before);
        assert_eq!(planned.len(), 3);
        assert_eq!(planned[0].id, "sajilo.nea.Ashwin-2083.new");
        assert!(planned[0].body.contains("Oct 17"), "{}", planned[0].body);
        assert!(planned[1].body.contains("2,559"), "{}", planned[1].body);

        // Found ten days in: only the penalty warning still helps.
        let late = Utc.with_ymd_and_hms(2026, 10, 21, 12, 0, 0).unwrap();
        let planned = plan(&[bill], late);
        assert_eq!(planned.len(), 1);
        assert_eq!(planned[0].id, "sajilo.nea.Ashwin-2083.penalty");
    }
}
