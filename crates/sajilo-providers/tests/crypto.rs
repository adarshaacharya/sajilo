//! Reads only from `fixtures/coingecko/` and `fixtures/kraken/`.

use chrono::{TimeZone, Utc};
use sajilo_providers::crypto;

const MARKETS: &str = include_str!("../../../fixtures/coingecko/markets.json");
const KRAKEN: &str = include_str!("../../../fixtures/kraken/ticker.json");
const CHART_7: &str = include_str!("../../../fixtures/coingecko/market-chart-bitcoin-7.json");

fn now() -> chrono::DateTime<Utc> {
    Utc.timestamp_opt(1_800_000_000, 0).unwrap()
}

#[test]
fn reads_the_recorded_market_list() {
    let snapshot = crypto::parse_coingecko(MARKETS, now()).expect("fixture parses");
    assert_eq!(snapshot.source, crypto::COINGECKO_SOURCE);
    assert!(!snapshot.coins.is_empty());
    let bitcoin = snapshot
        .coins
        .iter()
        .find(|coin| coin.id == "bitcoin")
        .expect("bitcoin");
    assert_eq!(bitcoin.symbol, "BTC", "tickers are upper case");
    assert!(bitcoin.price > 0.0);
    assert!(
        !bitcoin.sparkline.is_empty(),
        "a week of prices comes with the list"
    );
    assert!(snapshot.coins.iter().all(|coin| {
        coin.image_url
            .as_deref()
            .is_none_or(|url| url.starts_with("https://"))
    }));
}

/// The by-id lookup reads the same shape as the list; it just may be short.
#[test]
fn reads_coins_by_id_from_the_same_shape() {
    let coins = crypto::parse_coingecko_coins(MARKETS).expect("fixture parses");
    let listed = crypto::parse_coingecko(MARKETS, now())
        .expect("fixture parses")
        .coins;
    assert_eq!(coins.len(), listed.len());
}

#[test]
fn kraken_stands_in_with_its_fixed_majors() {
    let snapshot = crypto::parse_kraken(KRAKEN, now()).expect("fixture parses");
    assert_eq!(snapshot.source, crypto::KRAKEN_SOURCE);
    assert!(snapshot.coins.iter().any(|coin| coin.id == "bitcoin"));
    assert!(snapshot.coins.len() <= 12);
}

#[test]
fn reads_a_recorded_chart() {
    let chart = crypto::parse_chart(CHART_7, "bitcoin", 7, now()).expect("fixture parses");
    assert_eq!(chart.days, 7);
    assert!(chart.points.len() > 10);
    assert!(
        chart
            .points
            .windows(2)
            .all(|pair| pair[0].time <= pair[1].time)
    );
}
