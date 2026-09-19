//! Nepal's weekly holidays, which are not fixed.
//!
//! Saturday has always been one. Sunday joined it for government offices and
//! schools from 2082 Chaitra 23 (6 April 2026), a fuel-saving measure; Nepal
//! tried the same in 1999 and in 2022 and dropped it both times. So Sunday is
//! a dated rule: when it ends, `SUNDAY_UNTIL` gets that date and every month
//! before it keeps showing the Sundays that really were holidays.

use chrono::{NaiveDate, Weekday};
use serde::{Deserialize, Serialize};

/// First Sunday-holiday week: the cabinet decision took effect on this day.
pub const SUNDAY_FROM: NaiveDate = match NaiveDate::from_ymd_opt(2026, 4, 6) {
    Some(date) => date,
    None => panic!("a real date"),
};

/// The last day Sunday was a holiday, once the rule is withdrawn.
pub const SUNDAY_UNTIL: Option<NaiveDate> = None;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WeeklyHoliday {
    /// Everyone's day off.
    Saturday,
    /// Government offices and schools; many businesses and some
    /// municipalities still open.
    Sunday,
}

/// The weekly holiday `date` falls on, if any.
pub fn weekly_holiday(date: NaiveDate) -> Option<WeeklyHoliday> {
    use chrono::Datelike;
    match date.weekday() {
        Weekday::Sat => Some(WeeklyHoliday::Saturday),
        Weekday::Sun if date >= SUNDAY_FROM && SUNDAY_UNTIL.is_none_or(|until| date <= until) => {
            Some(WeeklyHoliday::Sunday)
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(text: &str) -> NaiveDate {
        text.parse().unwrap()
    }

    #[test]
    fn saturday_is_always_a_holiday() {
        assert_eq!(
            weekly_holiday(date("2020-01-04")),
            Some(WeeklyHoliday::Saturday)
        );
        assert_eq!(
            weekly_holiday(date("2026-09-19")),
            Some(WeeklyHoliday::Saturday)
        );
    }

    #[test]
    fn sunday_is_a_holiday_from_chaitra_23_2082() {
        assert_eq!(weekly_holiday(date("2026-03-29")), None);
        assert_eq!(weekly_holiday(date("2026-04-05")), None);
        assert_eq!(
            weekly_holiday(date("2026-04-12")),
            Some(WeeklyHoliday::Sunday)
        );
        assert_eq!(
            weekly_holiday(date("2026-09-20")),
            Some(WeeklyHoliday::Sunday)
        );
    }

    #[test]
    fn weekdays_are_working_days() {
        assert_eq!(weekly_holiday(date("2026-09-21")), None);
        assert_eq!(weekly_holiday(date("2026-09-18")), None);
    }
}
