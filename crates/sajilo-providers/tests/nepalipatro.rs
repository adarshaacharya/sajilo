//! Reads only from `fixtures/nepalipatro/`.

use chrono::{TimeZone, Utc};
use sajilo_api::bazar::{Metal, MetalUnit};
use sajilo_providers::nepalipatro;

const FIXTURE: &str = include_str!("../../../fixtures/nepalipatro/bullions.json");

fn parsed() -> sajilo_api::bazar::MetalRateSnapshot {
    nepalipatro::parse(FIXTURE, Utc.timestamp_opt(1_800_000_000, 0).unwrap())
        .expect("fixture parses")
}

#[test]
fn reads_both_units_from_the_newest_day() {
    let snapshot = parsed();
    assert_eq!(
        snapshot
            .rate(Metal::FineGold, MetalUnit::Tola)
            .expect("gold per tola")
            .price,
        306_800.0
    );
    assert_eq!(
        snapshot
            .rate(Metal::FineGold, MetalUnit::TenGram)
            .expect("gold per 10 g")
            .price,
        263_030.0
    );
}

/// The previous close is the day before in the same payload, so no second
/// request and no stored state are needed to draw the movement.
#[test]
fn takes_the_previous_close_from_the_preceding_day() {
    let gold = parsed()
        .rate(Metal::FineGold, MetalUnit::Tola)
        .expect("gold per tola")
        .clone();

    assert_eq!(gold.previous_price, 305_200.0);
    assert!(gold.is_up());
}

/// Tejabi is published as 0 on days the Federation quotes no rate for it. A
/// zero is absence, not a price — showing it would advertise free gold.
#[test]
fn drops_grades_quoted_as_zero() {
    assert!(parsed().rate(Metal::TejabiGold, MetalUnit::Tola).is_none());
}

/// A week of gold, oldest first — the order the sparkline draws in.
#[test]
fn carries_gold_history_oldest_first() {
    let history = parsed().gold_history;
    assert_eq!(history.len(), 7);
    assert_eq!(*history.last().expect("newest"), 306_800.0);
    assert!(history.first() < history.last());
}

#[test]
fn rejects_a_payload_with_no_days() {
    let now = Utc.timestamp_opt(1_800_000_000, 0).unwrap();
    assert!(nepalipatro::parse(r#"{"source":"Fenegosida","data":{}}"#, now).is_err());
}

/// The window has to stay bounded: with no `from-date` the API returns its
/// entire history, thousands of days of it.
#[test]
fn always_requests_a_bounded_window() {
    let url = nepalipatro::url(Utc.timestamp_opt(1_800_000_000, 0).unwrap());
    assert!(url.contains("from-date="), "{url}");
}
