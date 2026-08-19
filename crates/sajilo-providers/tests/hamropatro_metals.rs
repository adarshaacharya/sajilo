//! Reads only from `fixtures/hamropatro/`.

use chrono::{TimeZone, Utc};
use sajilo_api::bazar::{Metal, MetalUnit};
use sajilo_providers::hamropatro_metals as metals;

const FIXTURE: &str = include_str!("../../../fixtures/hamropatro/gold.html");

fn parsed() -> sajilo_api::bazar::MetalRateSnapshot {
    metals::parse(FIXTURE, Utc.timestamp_opt(1_800_000_000, 0).unwrap()).expect("fixture parses")
}

#[test]
fn reads_both_metals_per_tola() {
    let snapshot = parsed();
    let gold = snapshot
        .rate(Metal::FineGold, MetalUnit::Tola)
        .expect("gold rate");
    let silver = snapshot
        .rate(Metal::Silver, MetalUnit::Tola)
        .expect("silver rate");

    assert_eq!(gold.price, 306_800.0);
    assert_eq!(silver.price, 4_770.0);
}

/// The card publishes a direction and an amount, not the previous price, so the
/// previous price is derived. Getting the sign wrong would draw every rise as a
/// fall.
#[test]
fn derives_the_previous_price_from_the_movement() {
    let snapshot = parsed();
    let gold = snapshot
        .rate(Metal::FineGold, MetalUnit::Tola)
        .expect("gold rate");

    assert_eq!(gold.previous_price, 305_200.0);
    assert!(gold.is_up());
}

/// This page renders its 30-day series client-side, so the fallback carries no
/// sparkline. Inventing one from the two figures it does have would be a lie.
#[test]
fn carries_no_history() {
    assert!(parsed().gold_history.is_empty());
}

/// A page that no longer holds the prices must fail loudly rather than return
/// an empty snapshot the UI would render as "no gold today".
#[test]
fn rejects_a_page_without_prices() {
    let now = Utc.timestamp_opt(1_800_000_000, 0).unwrap();
    assert!(metals::parse("<html><body><p>Down for maintenance</p></body></html>", now).is_err());
}
