//! Ported from `CalendarEventStoreTests.swift`.

use sajilo_core::calendar::bikram_sambat::days_in_month;
use sajilo_core::calendar::events::{FIRST_EVENT_YEAR, LAST_EVENT_YEAR, events};

#[test]
fn reads_bundled_festival_data_for_shrawan_2083() {
    let month = events(2083, 4);
    assert_eq!(
        month[&1].name.as_deref(),
        Some("साउन संक्रान्ती, लुतो फाल्ने एवं राँको बाल्ने")
    );
    assert_eq!(month[&1].tithi.as_deref(), Some("तृतीया"));
    assert!(month[&2].is_public_holiday);
}

/// Festival and tithi data only exists for BS 2066–2083. The app must report no
/// data outside that range rather than "no events today".
#[test]
fn returns_no_data_outside_the_festival_range() {
    for year in [1992, 2000, 2065, 2084, 2085] {
        assert!(events(year, 1).is_empty(), "BS {year} should have no data");
    }
}

#[test]
fn covers_the_full_declared_range() {
    for year in FIRST_EVENT_YEAR..=LAST_EVENT_YEAR {
        assert!(
            !events(year, 1).is_empty(),
            "BS {year} is declared supported but has no data"
        );
    }
}

/// The leading cell of each source grid belongs to the preceding month and must
/// never be read as day 1 of this one. For Shrawan 2083 that cell reports Asar
/// as 31 days where the verified table says 32, so trusting it would corrupt
/// both the day number and the event attached to it.
#[test]
fn ignores_the_leading_cell_from_the_preceding_month() {
    let month = events(2083, 4);
    let day_count = days_in_month(2083, 4).unwrap() as u32;

    assert!(month.keys().all(|&day| (1..=day_count).contains(&day)));
    assert_eq!(
        month[&1].tithi.as_deref(),
        Some("तृतीया"),
        "day 1 must not be overwritten by the stray cell"
    );
}

/// The gap is always a trailing run, never a hole in the middle of a month. An
/// interior gap would mean the grid parser had drifted.
#[test]
fn gaps_are_always_trailing_never_interior() {
    for year in FIRST_EVENT_YEAR..=LAST_EVENT_YEAR {
        for month in 1..=12 {
            let Some(length) = days_in_month(year, month) else {
                continue;
            };
            let day_events = events(year, month);
            let present: Vec<u32> = (1..=length as u32)
                .filter(|day| day_events.contains_key(day))
                .collect();
            let expected: Vec<u32> = (1..=present.len() as u32).collect();
            assert_eq!(present, expected, "BS {year}-{month} has an interior gap");
        }
    }
}

/// Data is never claimed for a day the calendar says does not exist.
#[test]
fn never_reports_a_day_past_the_end_of_the_month() {
    for year in FIRST_EVENT_YEAR..=LAST_EVENT_YEAR {
        for month in 1..=12 {
            let length = days_in_month(year, month).unwrap() as u32;
            for day in events(year, month).keys() {
                assert!(
                    *day <= length,
                    "BS {year}-{month} claims day {day} of {length}"
                );
            }
        }
    }
}
