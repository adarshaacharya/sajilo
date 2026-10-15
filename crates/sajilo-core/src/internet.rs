//! Internet renewal reminders: a week ahead, three days ahead, and on the
//! last day, at 9:00 Nepal time. Pure, like `electricity`.

use chrono::{DateTime, Duration, NaiveDate, Utc};

use crate::notify::{PlannedNotification, ReminderKind, at_nepal_time, still_deliverable};
use crate::tools::units::grouped_decimal;

pub const REMINDER_HOUR: u32 = 9;
/// Days before the last day that a reminder goes out.
pub const AHEAD: [i64; 3] = [7, 3, 0];

/// Reminders for a subscription that runs out on `expires_on`. The id holds
/// the date, so a renewal (a later date) replaces them rather than adding.
pub fn plan(
    provider: &str,
    package: &str,
    expires_on: NaiveDate,
    renewal_rate: Option<f64>,
    now: DateTime<Utc>,
) -> Vec<PlannedNotification> {
    let price = renewal_rate
        .map(|rate| format!(" Renewal: Rs {}.", grouped_decimal(rate, 0)))
        .unwrap_or_default();
    AHEAD
        .iter()
        .filter_map(|&days| {
            let date = expires_on - Duration::days(days);
            let fire_at = at_nepal_time(date, REMINDER_HOUR, 0)?;
            if !still_deliverable(fire_at, now) {
                return None;
            }
            let title = match days {
                0 => format!("{provider} runs out today"),
                1 => format!("{provider} runs out tomorrow"),
                days => format!("{provider} runs out in {days} days"),
            };
            Some(PlannedNotification {
                id: format!("sajilo.internet.{provider}.{expires_on}.{days}"),
                kind: ReminderKind::Keeper,
                title,
                body: format!("{package}.{price}"),
                fire_at,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn a_week_three_days_and_the_day() {
        let expires = NaiveDate::from_ymd_opt(2027, 2, 9).unwrap();
        let now = Utc.with_ymd_and_hms(2026, 10, 15, 0, 0, 0).unwrap();
        let planned = plan("WorldLink", "6G 400Mbps", expires, Some(18080.0), now);
        let titles: Vec<&str> = planned.iter().map(|p| p.title.as_str()).collect();
        assert_eq!(
            titles,
            [
                "WorldLink runs out in 7 days",
                "WorldLink runs out in 3 days",
                "WorldLink runs out today"
            ]
        );
        assert!(planned[0].body.contains("18,080"));
    }

    #[test]
    fn only_the_ones_still_ahead() {
        let expires = NaiveDate::from_ymd_opt(2027, 2, 9).unwrap();
        // Four days out: the week-ahead one has passed.
        let now = Utc.with_ymd_and_hms(2027, 2, 5, 6, 0, 0).unwrap();
        assert_eq!(plan("WorldLink", "x", expires, None, now).len(), 2);
    }
}
