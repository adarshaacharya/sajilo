//! Reads only from `fixtures/kalimati/`.

use chrono::{TimeZone, Utc};
use sajilo_api::bazar::MarketUnit;
use sajilo_providers::kalimati;

const FIXTURE: &str = include_str!("../../../fixtures/kalimati/prices.html");

fn parsed() -> sajilo_api::bazar::VegetableMarketSnapshot {
    kalimati::parse(FIXTURE, Utc.timestamp_opt(1_800_000_000, 0).unwrap()).expect("fixture parses")
}

#[test]
fn decodes_the_recorded_board() {
    let snapshot = parsed();
    assert!(
        snapshot.prices.len() > 50,
        "the board lists ~100 items, got {}",
        snapshot.prices.len()
    );
    assert!(snapshot.prices.iter().all(|price| price.average > 0.0));
}

/// Prices arrive as `रू ६०.००` — Devanagari digits behind a currency marker.
#[test]
fn reads_devanagari_prices() {
    let snapshot = parsed();
    let tomato = snapshot
        .price_named("गोलभेडा ठूलो(नेपाली)")
        .expect("the fixture opens with local tomatoes");

    assert!((tomato.minimum - 60.0).abs() < 0.01);
    assert!((tomato.maximum - 70.0).abs() < 0.01);
    assert!((tomato.average - 65.0).abs() < 0.01);
    assert_eq!(tomato.unit, MarketUnit::Kilogram);
}

/// Every row must have min ≤ average ≤ max, or a column has been misread.
#[test]
fn the_spread_is_internally_consistent() {
    for price in &parsed().prices {
        assert!(
            price.minimum <= price.average && price.average <= price.maximum,
            "{}: {} / {} / {}",
            price.name,
            price.minimum,
            price.average,
            price.maximum
        );
    }
}

/// The board writes kilogram several ways in a single day's table because the
/// rows are typed by hand — the fixture's first two rows use `के.जी.` and
/// `केजी`. Both must land on the same unit.
#[test]
fn absorbs_hand_typed_unit_spellings() {
    let snapshot = parsed();
    let local = snapshot.price_named("गोलभेडा ठूलो(नेपाली)").unwrap();
    let indian = snapshot.price_named("गोलभेडा ठूलो(भारतीय)").unwrap();
    assert_eq!(local.unit, MarketUnit::Kilogram);
    assert_eq!(indian.unit, MarketUnit::Kilogram);
}

/// The qualifier is never cleaned up: it separates a local tomato from an
/// Indian one, and they differ in price.
#[test]
fn keeps_the_published_name_verbatim() {
    let snapshot = parsed();
    assert!(snapshot.price_named("गोलभेडा ठूलो(नेपाली)").is_some());
    assert!(snapshot.price_named("गोलभेडा ठूलो(भारतीय)").is_some());
    // A bare "गोलभेडा" is nobody's published name, so it must not match.
    assert!(snapshot.price_named("गोलभेडा").is_none());
}

/// The board does not publish on every holiday, so the rates on screen are
/// sometimes the previous trading day's and must say so.
#[test]
fn reads_the_boards_own_bikram_sambat_date() {
    let published = parsed().published_on.expect("the board dates its table");
    // The fixture is stamped "वि.सं. भदौ ०१, २०८३" — Bhadra is month 5.
    assert_eq!(published.year, 2083);
    assert_eq!(published.month, 5);
    assert_eq!(published.day, 1);
}

#[test]
fn rejects_a_date_stamp_it_cannot_trust() {
    assert_eq!(kalimati::published_date("no marker here"), None);
    assert_eq!(
        kalimati::published_date("वि.सं. ३१, २०८३"),
        None,
        "no month name"
    );
    assert_eq!(
        kalimati::published_date("वि.सं. साउन ३१, ९९९९"),
        None,
        "year outside the supported range"
    );
    assert_eq!(
        kalimati::published_date("वि.सं. साउन ९९, २०८३"),
        None,
        "day 99"
    );
    assert!(kalimati::published_date("वि.सं. साउन ३१, २०८३").is_some());
}

/// Names nest — "भेडे खुर्सानी" is capsicum while "खुर्सानी" is chilli — so the
/// table must be matched longest-first or every capsicum is filed as a chilli.
#[test]
fn resolves_nested_produce_names_longest_first() {
    assert_eq!(kalimati::english_name("भेडे खुर्सानी"), Some("Capsicum"));
    assert_eq!(kalimati::english_name("खुर्सानी सुकेको"), Some("Chilli"));
    // The board's own typo'd spelling of capsicum must not fall through to chilli.
    assert_eq!(kalimati::english_name("भेडे खु्र्सानी"), Some("Capsicum"));
    assert_eq!(kalimati::english_name("रातो बन्दा"), Some("Red cabbage"));
    assert_eq!(kalimati::english_name("बन्दा"), Some("Cabbage"));
    assert_eq!(kalimati::english_name("गान्टे मूला"), Some("Kohlrabi"));
    assert_eq!(kalimati::english_name("मूला"), Some("Radish"));
}

/// Anything uncertain is left out rather than guessed at: a wrong label on a
/// price list means someone buys the wrong thing.
#[test]
fn leaves_an_unknown_item_unlabelled() {
    assert_eq!(kalimati::english_name("कुनै नयाँ तरकारी"), None);
}

/// Search must find an item by either script.
#[test]
fn searches_by_nepali_or_english_name() {
    let snapshot = parsed();
    assert!(!snapshot.matching("गोलभेडा").is_empty());
    assert!(!snapshot.matching("tomato").is_empty());
    assert!(!snapshot.matching("Tomato").is_empty(), "case-insensitive");
    // An empty query is not a filter.
    assert_eq!(snapshot.matching("  ").len(), snapshot.prices.len());
    assert!(snapshot.matching("zzzz").is_empty());
}

#[test]
fn rejects_a_page_it_cannot_read() {
    let now = Utc.timestamp_opt(0, 0).unwrap();
    assert!(kalimati::parse("<html><body>closed</body></html>", now).is_err());
    // Headings but no rows is not a price board.
    assert!(kalimati::parse("<table><tr><th>कृषि उपज</th></tr></table>", now).is_err());
}

/// A row that does not yield a name, a unit and three amounts is dropped rather
/// than guessed at — which is what would catch a column reordering.
#[test]
fn drops_a_row_it_cannot_fully_read() {
    let page = "<table><tr><th>कृषि उपज</th><th>ईकाइ</th><th>न्यूनतम</th><th>अधिकतम</th><th>औसत</th></tr>\
        <tr><td>आलु रातो</td><td>के.जी.</td><td>रू ५०.००</td><td>रू ६०.००</td><td>रू ५५.००</td></tr>\
        <tr><td>अज्ञात</td><td>बोरा</td><td>रू १०.००</td><td>रू २०.००</td><td>रू १५.००</td></tr>\
        <tr><td></td><td>के.जी.</td><td>रू १.००</td><td>रू २.००</td><td>रू १.५०</td></tr></table>";
    let snapshot = kalimati::parse(page, Utc.timestamp_opt(0, 0).unwrap()).expect("one good row");

    assert_eq!(
        snapshot.prices.len(),
        1,
        "unknown unit and blank name dropped"
    );
    assert_eq!(snapshot.prices[0].name, "आलु रातो");
    assert_eq!(snapshot.prices[0].english_name.as_deref(), Some("Potato"));
}
