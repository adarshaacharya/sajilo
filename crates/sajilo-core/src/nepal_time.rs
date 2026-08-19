//! Everything Sajilo shows is anchored to Nepal, not to wherever the user is:
//! the calendar rolls over at Kathmandu midnight and the rates are the Nepali
//! central bank's. Centralising the offset keeps that decision in one place.

use chrono::{DateTime, FixedOffset, NaiveDate, Utc};

/// Asia/Kathmandu is a fixed +05:45 with no DST, so a `FixedOffset` is exact
/// and spares the crate a tz-database dependency.
pub fn offset() -> FixedOffset {
    FixedOffset::east_opt(5 * 3600 + 45 * 60).expect("+05:45 is a valid offset")
}

pub fn now() -> DateTime<FixedOffset> {
    Utc::now().with_timezone(&offset())
}

/// The current Gregorian date in Nepal — the app's notion of "today".
pub fn today() -> NaiveDate {
    now().date_naive()
}
