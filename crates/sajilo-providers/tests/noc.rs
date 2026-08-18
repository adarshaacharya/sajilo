//! Reads only from `fixtures/noc/`.

use chrono::{NaiveDate, TimeZone, Utc};
use sajilo_api::bazar::Fuel;
use sajilo_providers::noc;

const FIXTURE: &str = include_str!("../../../fixtures/noc/prices.html");

fn parsed() -> sajilo_api::bazar::FuelPriceSnapshot {
    noc::parse(FIXTURE, Utc.timestamp_opt(1_800_000_000, 0).unwrap()).expect("fixture parses")
}

#[test]
fn decodes_the_recorded_table() {
    let snapshot = parsed();
    assert_eq!(snapshot.prices.len(), 4, "petrol, diesel, kerosene, LPG");
    assert!(snapshot.prices.iter().all(|price| price.price > 0.0));
}

/// Column *positions* are never assumed. NOC's table carries `ATF (DP)` and
/// `ATF (DF)` columns after the four fuels, so reading by index would work
/// today and break the day a column is inserted.
#[test]
fn reads_each_fuel_from_its_own_named_column() {
    let snapshot = parsed();

    // A litre of petrol is a three-figure price; an LPG cylinder is four.
    let petrol = snapshot.price(Fuel::Petrol).expect("petrol is quoted");
    assert!(
        (100.0..400.0).contains(&petrol.price),
        "petrol per litre looks wrong: {}",
        petrol.price
    );

    let lpg = snapshot.price(Fuel::Lpg).expect("LPG is quoted");
    assert!(
        lpg.price > 1_000.0,
        "LPG is quoted per 14.2 kg cylinder, got {}",
        lpg.price
    );

    // The ATF columns must not be mistaken for one of the four fuels.
    assert!(snapshot.prices.iter().all(|price| price.price != 249.00));
}

/// The row under the newest is the revision it replaced, which is what makes
/// the change figure meaningful.
#[test]
fn compares_against_the_previous_revision() {
    let snapshot = parsed();
    let petrol = snapshot.price(Fuel::Petrol).unwrap();
    // The fixture's two newest revisions are 200.00 and 197.00.
    assert!((petrol.price - 200.0).abs() < 0.01);
    assert!((petrol.previous_price - 197.0).abs() < 0.01);
    assert!(petrol.is_up());
    assert!(!petrol.is_unchanged());

    // LPG held steady across both revisions.
    let lpg = snapshot.price(Fuel::Lpg).unwrap();
    assert!(lpg.is_unchanged());
}

/// NOC has typed the effective-date cell several ways. The AD date inside the
/// brackets is the part that parses unambiguously.
#[test]
fn reads_the_effective_date_in_every_spelling_noc_uses() {
    for (cell, expected) in [
        ("2083.04.17(2026.08.02)", (2026, 8, 2)),
        ("2083.03.16 (2026.06.30)", (2026, 6, 30)),
        ("2083-03-01 (2026.06.15)", (2026, 6, 15)),
        ("2083/03/01 (2026/06/15)", (2026, 6, 15)),
    ] {
        let (year, month, day) = expected;
        assert_eq!(
            noc::effective_date(cell),
            NaiveDate::from_ymd_opt(year, month, day),
            "{cell}"
        );
    }
    assert_eq!(
        parsed().effective_from,
        NaiveDate::from_ymd_opt(2026, 8, 2).unwrap()
    );
}

/// A malformed cell yields no date rather than a wrong one — the caller then
/// falls back to the fetch date instead of publishing a fabricated revision.
///
/// Note the bracketed date is Gregorian by NOC's convention and nothing more:
/// BS 2083 and AD 2083 are the same integer, so no check here can tell them
/// apart. Only years no calendar would use are rejected.
#[test]
fn rejects_a_date_cell_it_cannot_trust() {
    assert_eq!(noc::effective_date("2083.04.17"), None, "no bracket");
    assert_eq!(
        noc::effective_date("(1800.04.17)"),
        None,
        "implausible year"
    );
    assert_eq!(noc::effective_date("(2026.13.02)"), None, "month 13");
    assert_eq!(noc::effective_date("(2026.08.32)"), None, "day 32");
    assert_eq!(noc::effective_date("(2026.08)"), None, "only two parts");
    assert_eq!(
        noc::effective_date(")2026.08.02("),
        None,
        "brackets reversed"
    );
}

#[test]
fn rejects_a_page_it_cannot_read() {
    let now = Utc.timestamp_opt(0, 0).unwrap();
    assert!(noc::parse("<html><body>no table here</body></html>", now).is_err());
    // A table with the right headings but no data row is not a price list.
    assert!(
        noc::parse(
            "<table><tr><th>petrol</th><th>diesel</th></tr></table>",
            now
        )
        .is_err()
    );
}

/// Selecting the table by its headings means another table appearing above it
/// on the page does not break the read.
#[test]
fn finds_the_price_table_below_an_unrelated_one() {
    let page = "<table><tr><th>Notice</th></tr><tr><td>Office closed</td></tr></table>\
        <table><tr><th>effective Date</th><th>petrol</th><th>diesel</th></tr>\
        <tr><td>2083.04.17(2026.08.02)</td><td>200.00</td><td>198.00</td></tr>\
        <tr><td>2083.03.31(2026.07.15)</td><td>197.00</td><td>195.00</td></tr></table>";
    let snapshot = noc::parse(page, Utc.timestamp_opt(0, 0).unwrap()).expect("second table wins");
    assert!((snapshot.price(Fuel::Petrol).unwrap().price - 200.0).abs() < 0.01);
    assert!((snapshot.price(Fuel::Diesel).unwrap().price - 198.0).abs() < 0.01);
}
