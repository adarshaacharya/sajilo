//! Reads only from `fixtures/nrb/`. No test in this crate touches the network.

use chrono::{NaiveDate, TimeZone, Utc};
use sajilo_providers::nrb;

const FIXTURE: &str = include_str!("../../../fixtures/nrb/rates.json");

fn parsed() -> sajilo_api::forex::ForexSnapshot {
    nrb::parse(FIXTURE, Utc.timestamp_opt(1_800_000_000, 0).unwrap()).expect("fixture parses")
}

#[test]
fn decodes_the_recorded_payload() {
    let snapshot = parsed();
    assert!(!snapshot.rates.is_empty());

    let usd = snapshot.rate("USD").expect("NRB always quotes USD");
    assert_eq!(usd.unit, 1);
    assert!(
        usd.buy > 0.0 && usd.sell >= usd.buy,
        "sell is never below buy"
    );
}

/// NRB quotes INR per 100. Reading the unit as 1 misprices it by two orders of
/// magnitude — the defect this field exists to prevent.
#[test]
fn preserves_the_quoted_unit() {
    let snapshot = parsed();
    let inr = snapshot.rate("INR").expect("INR is quoted");
    assert_eq!(inr.unit, 100);
    assert!(
        (1.5..1.8).contains(&inr.buy_per_unit()),
        "one Indian rupee is about 1.6 NPR, got {}",
        inr.buy_per_unit()
    );
}

/// The window is requested precisely because NRB does not publish every day.
/// The snapshot must report the most recent day in it, not the first.
#[test]
fn takes_the_most_recent_day_in_the_window() {
    let snapshot = parsed();
    let dates: Vec<NaiveDate> = vec![snapshot.date];
    assert!(!dates.is_empty());
    assert!(snapshot.date >= NaiveDate::from_ymd_opt(2026, 8, 10).unwrap());
    assert!(snapshot.date <= NaiveDate::from_ymd_opt(2026, 8, 17).unwrap());
}

/// The whole window is kept, which is what feeds the sparkline at no extra
/// request cost.
#[test]
fn keeps_the_window_as_history() {
    let snapshot = parsed();
    let usd = snapshot.history.get("USD").expect("USD history");
    assert!(usd.len() > 1, "a window should yield more than one day");
    assert!(usd.iter().all(|&rate| rate > 0.0));
}

/// NRB's `modified_on` can predate `published_on`, so whichever is later is the
/// honest answer.
#[test]
fn reports_the_later_source_timestamp() {
    let snapshot = parsed();
    let stamp = snapshot
        .source_timestamp()
        .expect("NRB stamps its payloads");
    if let (Some(published), Some(modified)) = (snapshot.published_on, snapshot.modified_on) {
        assert_eq!(stamp, published.max(modified));
    }
}

#[test]
fn requests_a_lookback_window_not_a_single_day() {
    let url = nrb::request_url(NaiveDate::from_ymd_opt(2026, 8, 17).unwrap());
    assert!(url.contains("from=2026-08-10"), "{url}");
    assert!(url.contains("to=2026-08-17"), "{url}");
}

/// A source that changes shape must fail loudly as a parse error, never return
/// a plausible-but-empty snapshot.
#[test]
fn rejects_a_payload_it_cannot_read() {
    let now = Utc.timestamp_opt(0, 0).unwrap();
    assert!(nrb::parse("not json", now).is_err());
    assert!(nrb::parse(r#"{"data":{"payload":[]}}"#, now).is_err());
    // Well-formed, dated, but every rate unparseable.
    let junk = r#"{"data":{"payload":[{"date":"2026-08-17","published_on":null,"modified_on":null,
        "rates":[{"currency":{"iso3":"USD","name":"US Dollar","unit":1},"buy":"","sell":""}]}]}}"#;
    assert!(nrb::parse(junk, now).is_err());
}

/// A parse failure never fixes itself, so the scheduler must not retry it.
#[test]
fn a_parse_failure_is_not_retryable() {
    let error = nrb::parse("not json", Utc.timestamp_opt(0, 0).unwrap()).unwrap_err();
    assert!(!error.is_retryable());
    assert_eq!(error.source_name(), nrb::SOURCE_NAME);
}
