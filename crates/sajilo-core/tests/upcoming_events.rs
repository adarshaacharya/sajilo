//! Ported from `UpcomingEventsServiceTests.swift`.

use std::collections::HashSet;

use sajilo_core::NepaliDate;
use sajilo_core::calendar::upcoming::{
    DEFAULT_HORIZON_DAYS, DEFAULT_LIMIT, UpcomingEventFilter, events,
};

fn today() -> NepaliDate {
    NepaliDate::new(2083, 4, 1)
}

fn defaults(from: NepaliDate) -> Vec<sajilo_core::calendar::upcoming::UpcomingEvent> {
    events(from, DEFAULT_LIMIT, DEFAULT_HORIZON_DAYS)
}

#[test]
fn starts_with_today_when_today_is_itself_a_festival() {
    let events = defaults(today());
    let first = events.first().expect("today is a festival");

    assert_eq!(first.date, today());
    assert_eq!(first.name, "साउन संक्रान्ती, लुतो फाल्ने एवं राँको बाल्ने");
    assert_eq!(first.days_away, 0);
    assert_eq!(first.relative_text(), "Today");
}

#[test]
fn orders_events_by_how_soon_they_are() {
    let events = defaults(today());
    let distances: Vec<i64> = events.iter().map(|e| e.days_away).collect();
    let mut sorted = distances.clone();
    sorted.sort_unstable();

    assert_eq!(distances, sorted);
    let ids: HashSet<String> = events.iter().map(|e| e.id()).collect();
    assert_eq!(ids.len(), events.len(), "no duplicates");
}

/// BS 2083-04 carries named days on 1, 6, 9, 13 — the gaps double as a check
/// that `days_away` counts real elapsed days, not array positions.
#[test]
fn computes_days_remaining_from_today() {
    let events = events(today(), 4, DEFAULT_HORIZON_DAYS);

    assert_eq!(
        events.iter().map(|e| e.days_away).collect::<Vec<_>>(),
        [0, 5, 8, 12]
    );
    assert_eq!(
        events.iter().map(|e| e.date.day).collect::<Vec<_>>(),
        [1, 6, 9, 13]
    );
    let holiday = events
        .iter()
        .find(|e| e.date.day == 9)
        .expect("day 9 present");
    assert!(holiday.is_public_holiday);
}

#[test]
fn never_returns_a_past_event() {
    let mid_month = NepaliDate::new(2083, 4, 20);
    let events = defaults(mid_month);

    assert!(events.iter().all(|e| e.date >= mid_month));
    assert!(events.iter().all(|e| e.days_away >= 0));
}

/// The scan has to roll into the following month and the following year.
#[test]
fn crosses_month_and_year_boundaries() {
    let late_in_year = NepaliDate::new(2082, 12, 25);
    let events = events(late_in_year, 8, DEFAULT_HORIZON_DAYS);

    assert!(!events.is_empty());
    assert!(events.iter().any(|e| e.date.year == 2083));
    assert!(events.iter().all(|e| e.days_away >= 0));
}

/// BS 2083 is the last year with festival data, so the list empties as it is
/// crossed. The scan must stop rather than walk the whole calendar range.
#[test]
fn stops_at_the_end_of_the_festival_data() {
    let events = defaults(NepaliDate::new(2083, 12, 25));
    assert!(events.iter().all(|e| e.date.year == 2083));
}

#[test]
fn respects_the_requested_limit() {
    assert_eq!(events(today(), 3, DEFAULT_HORIZON_DAYS).len(), 3);
    assert_eq!(events(today(), 1, DEFAULT_HORIZON_DAYS).len(), 1);
    assert!(events(today(), 0, DEFAULT_HORIZON_DAYS).is_empty());
}

#[test]
fn respects_the_horizon_and_does_not_run_away() {
    let events = events(today(), 500, 30);

    assert!(events.iter().all(|e| e.days_away <= 30));
    assert!(!events.is_empty());
}

/// Past the bundled event data the scan must stop cleanly.
#[test]
fn terminates_beyond_the_bundled_event_data() {
    assert!(defaults(NepaliDate::new(2084, 1, 1)).is_empty());
}

#[test]
fn labels_tomorrow_distinctly() {
    let day_before = NepaliDate::new(2083, 4, 5);
    let events = events(day_before, 1, DEFAULT_HORIZON_DAYS);

    assert_eq!(events[0].days_away, 1);
    assert_eq!(events[0].relative_text(), "Tomorrow");
}

#[test]
fn filters_current_festivals_and_public_holidays_independently() {
    let all = events(today(), 12, DEFAULT_HORIZON_DAYS);

    let current: Vec<_> = all
        .iter()
        .filter(|e| UpcomingEventFilter::Current.includes(e))
        .collect();
    let festivals: Vec<_> = all
        .iter()
        .filter(|e| UpcomingEventFilter::Festivals.includes(e))
        .collect();
    let holidays: Vec<_> = all
        .iter()
        .filter(|e| UpcomingEventFilter::PublicHolidays.includes(e))
        .collect();

    assert!(current.iter().all(|e| e.days_away < 7));
    assert_eq!(festivals.len(), all.len());
    assert!(holidays.iter().all(|e| e.is_public_holiday));
    assert!(!holidays.is_empty());
}
