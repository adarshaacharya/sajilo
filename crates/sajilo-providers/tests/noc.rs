//! Reads only from `fixtures/noc/`.

use chrono::{NaiveDate, TimeZone, Utc};
use sajilo_api::bazar::Fuel;
use sajilo_providers::noc;

/// NOC's price list for Kathmandu, as recorded on 2026-10-01.
const FIXTURE: &str = include_str!("../../../fixtures/noc/fuel-prices.json");

fn parsed() -> sajilo_api::bazar::FuelPriceSnapshot {
    noc::parse(FIXTURE, Utc.timestamp_opt(1_800_000_000, 0).unwrap()).expect("fixture parses")
}

#[test]
fn decodes_the_recorded_list() {
    let snapshot = parsed();
    assert_eq!(snapshot.prices.len(), 4, "petrol, diesel, kerosene, LPG");
    assert!(snapshot.prices.iter().all(|price| price.price > 0.0));
    assert_eq!(
        snapshot.effective_from,
        NaiveDate::from_ymd_opt(2026, 10, 1).unwrap()
    );
}

/// Fuels are matched by slug, so the aviation fuels in the same list never
/// stand in for one of the four.
#[test]
fn reads_each_fuel_by_its_slug() {
    let snapshot = parsed();
    let petrol = snapshot.price(Fuel::Petrol).expect("petrol is quoted");
    assert!((petrol.price - 200.0).abs() < 0.01);
    let lpg = snapshot.price(Fuel::Lpg).expect("LPG is quoted");
    assert!(
        lpg.price > 1_000.0,
        "per 14.2 kg cylinder, got {}",
        lpg.price
    );
    assert!(snapshot.prices.iter().all(|price| price.price != 249.00));
}

/// Kathmandu's rows only, though the search also returns Pokhara's and
/// Dipayal's.
#[test]
fn shows_kathmandu_only() {
    let other = r#"{"data":[{"price":"150.00","price_date":"2026-10-01 09:00:00",
        "fuel_type":{"slug":"petrol"},"location":{"name":"Pokhara"}}]}"#;
    assert!(noc::parse(other, Utc.timestamp_opt(0, 0).unwrap()).is_err());
}

/// The previous price is the newest from an earlier day; a second entry on the
/// same day, minutes apart, is not a revision.
#[test]
fn compares_against_the_previous_day() {
    let body = r#"{"data":[
        {"price":"202.00","price_date":"2026-10-01 09:39:00","fuel_type":{"slug":"petrol"},"location":{"name":"Kathmandu"}},
        {"price":"201.00","price_date":"2026-10-01 09:30:00","fuel_type":{"slug":"petrol"},"location":{"name":"Kathmandu"}},
        {"price":"197.00","price_date":"2026-09-20 10:56:00","fuel_type":{"slug":"petrol"},"location":{"name":"Kathmandu"}},
        {"price":"bad","price_date":"2026-10-02 09:00:00","fuel_type":{"slug":"petrol"},"location":{"name":"Kathmandu"}}
    ]}"#;
    let snapshot = noc::parse(body, Utc.timestamp_opt(0, 0).unwrap()).unwrap();
    let petrol = snapshot.price(Fuel::Petrol).unwrap();
    assert!(
        (petrol.price - 202.0).abs() < 0.01,
        "an unreadable row is skipped"
    );
    assert!((petrol.previous_price - 197.0).abs() < 0.01);
    assert!(petrol.is_up());
}

#[test]
fn reads_the_dates_noc_writes() {
    assert_eq!(
        noc::price_date("2026-10-01 09:39:00").map(|at| at.date()),
        NaiveDate::from_ymd_opt(2026, 10, 1)
    );
    assert_eq!(
        noc::price_date("2026-10-01").map(|at| at.date()),
        NaiveDate::from_ymd_opt(2026, 10, 1)
    );
    assert_eq!(noc::price_date("01/10/2026"), None);
    assert_eq!(noc::price_date("1800-01-01"), None);
}

#[test]
fn rejects_a_response_it_cannot_read() {
    let now = Utc.timestamp_opt(0, 0).unwrap();
    assert!(noc::parse("<html>maintenance</html>", now).is_err());
    assert!(noc::parse(r#"{"success":true,"data":[]}"#, now).is_err());
}

#[test]
fn each_fuel_carries_its_revisions_oldest_first_one_per_day() {
    let body = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../fixtures/noc/fuel-prices.json"
    ))
    .unwrap();
    let snapshot = sajilo_providers::noc::parse(&body, chrono::Utc::now()).unwrap();
    for price in &snapshot.prices {
        let history = &price.history;
        assert!(!history.is_empty(), "{:?}", price.fuel);
        assert!(history.windows(2).all(|pair| pair[0].time < pair[1].time));
        assert_eq!(
            history.last().unwrap().price,
            price.price,
            "ends at today's price"
        );
        assert!(price.changed_on.is_some());
    }
}
