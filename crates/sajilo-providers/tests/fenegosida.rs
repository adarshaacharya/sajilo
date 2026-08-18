//! Reads only from `fixtures/fenegosida/`.

use chrono::{TimeZone, Utc};
use sajilo_api::bazar::{Metal, MetalUnit};
use sajilo_providers::fenegosida;

const FIXTURE: &str = include_str!("../../../fixtures/fenegosida/today.json");

fn parsed() -> sajilo_api::bazar::MetalRateSnapshot {
    fenegosida::parse(FIXTURE, Utc.timestamp_opt(1_800_000_000, 0).unwrap())
        .expect("fixture parses")
}

#[test]
fn decodes_the_recorded_payload() {
    let snapshot = parsed();
    assert!(!snapshot.rates.is_empty());
    assert!(snapshot.rates.iter().all(|rate| rate.price > 0.0));
}

/// `todayBaseRatePerGram` is named for grams but holds the rate for whatever
/// unit `rateType` names. Reading it as per-gram is out by an order of
/// magnitude — one tola of gold is over Rs 100,000, one gram is not.
#[test]
fn reads_the_quoted_unit_not_the_field_name() {
    let snapshot = parsed();
    let gold = snapshot
        .rate(Metal::FineGold, MetalUnit::Tola)
        .expect("fine gold per tola is always quoted");

    assert!(
        gold.price > 100_000.0,
        "a tola of gold costs six figures, got {}",
        gold.price
    );
    assert!(
        gold.price_per_gram() < gold.price,
        "per-gram must be derived down from the tola price"
    );
}

/// Both units are published for each metal, and they must not be conflated.
#[test]
fn keeps_tola_and_ten_gram_apart() {
    let snapshot = parsed();
    let tola = snapshot.rate(Metal::FineGold, MetalUnit::Tola).unwrap();
    let ten_gram = snapshot.rate(Metal::FineGold, MetalUnit::TenGram).unwrap();

    assert_ne!(tola.price, ten_gram.price);
    // One tola is 11.66 g, so it must cost more than 10 g of the same metal.
    assert!(tola.price > ten_gram.price);
}

/// `rateType` is free Nepali text, so the metal and unit are read out of it.
#[test]
fn reads_the_metal_and_unit_from_free_text() {
    assert_eq!(
        fenegosida::metal_from("असली चाँदी दर (१ तोला)"),
        Some(Metal::Silver)
    );
    assert_eq!(
        fenegosida::metal_from("तेजाबी सुन दर (१० ग्राम)"),
        Some(Metal::TejabiGold)
    );
    assert_eq!(
        fenegosida::metal_from("छापावाल सुन (१ तोला)"),
        Some(Metal::FineGold)
    );
    // Tejabi must win over the bare "सुन" it also contains, or every tejabi row
    // would be filed as fine gold.
    assert_eq!(fenegosida::metal_from("तेजाबी सुन"), Some(Metal::TejabiGold));
    assert_eq!(fenegosida::metal_from("प्लाटिनम"), None);

    assert_eq!(fenegosida::unit_from("(१० ग्राम)"), Some(MetalUnit::TenGram));
    assert_eq!(fenegosida::unit_from("(१ तोला)"), Some(MetalUnit::Tola));
    assert_eq!(fenegosida::unit_from("(१ किलो)"), None);
}

/// The Federation's own publish time, not when Sajilo fetched it.
#[test]
fn carries_the_source_publish_time() {
    let snapshot = parsed();
    let freshness = &snapshot.freshness;
    let published = freshness.source_timestamp.expect("payload is timestamped");
    assert_ne!(published, freshness.fetched_at);
}

/// History is a nice-to-have; a broken chart must cost the sparkline and
/// nothing else.
#[test]
fn a_broken_history_yields_an_empty_series() {
    assert!(fenegosida::parse_history("not json").is_empty());
    assert!(fenegosida::parse_history(r#"{"goldData":[]}"#).is_empty());
    assert_eq!(
        fenegosida::parse_history(r#"{"goldData":[{"tola":1.0},{"tola":null},{"tola":3.0}]}"#),
        vec![1.0, 3.0]
    );
}

#[test]
fn rejects_a_payload_it_cannot_read() {
    let now = Utc.timestamp_opt(0, 0).unwrap();
    assert!(fenegosida::parse("not json", now).is_err());
    assert!(fenegosida::parse("[]", now).is_err());
    // Well-formed, but no row names a metal this parser knows.
    let unknown = r#"[{"todayDate":"2026-08-17T04:55:40.199+00:00",
        "yestardayDate":"2026-08-16T04:40:51.919+00:00","rateType":"प्लाटिनम",
        "todayBaseRatePerGram":1.0,"yestardayBaseRatePerGram":1.0}]"#;
    assert!(fenegosida::parse(unknown, now).is_err());
}
