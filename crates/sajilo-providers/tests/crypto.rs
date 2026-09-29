//! Reads only from `fixtures/coinpaprika/` and `fixtures/binance/`.

use chrono::{TimeZone, Utc};
use sajilo_providers::crypto;

const TICKERS: &str = include_str!("../../../fixtures/coinpaprika/tickers.json");
const TICKER_PEPE: &str = include_str!("../../../fixtures/coinpaprika/ticker-pepe.json");
const SEARCH_PEPE: &str = include_str!("../../../fixtures/coinpaprika/search-pepe.json");
const HISTORY_365: &str = include_str!("../../../fixtures/coinpaprika/historical-bitcoin-365.json");
const BINANCE_LIST: &str = include_str!("../../../fixtures/binance/symbol-list.json");
const KLINES_1: &str = include_str!("../../../fixtures/binance/klines-btc-1.json");
const KLINES_7: &str = include_str!("../../../fixtures/binance/klines-btc-7.json");

fn now() -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 9, 29, 17, 0, 0).unwrap()
}

#[test]
fn reads_coinpaprikas_ranked_list() {
    let coins = crypto::parse_paprika_coins(TICKERS).expect("fixture parses");
    assert_eq!(coins.len(), 60);
    let bitcoin = &coins[0];
    assert_eq!(
        (bitcoin.id.as_str(), bitcoin.symbol.as_str(), bitcoin.rank),
        ("btc-bitcoin", "BTC", Some(1))
    );
    assert!(bitcoin.price > 1000.0);
    assert!(bitcoin.market_cap.is_some() && bitcoin.change_24h.is_some());
    assert!(bitcoin.change_7d.is_some() && bitcoin.all_time_high.is_some());
    assert_eq!(
        bitcoin.all_time_high_date.as_deref().map(str::len),
        Some(10)
    );
    assert!(
        coins
            .iter()
            .all(|coin| coin.symbol == coin.symbol.to_uppercase())
    );
}

#[test]
fn reads_one_coin_by_id() {
    let pepe = crypto::parse_paprika_coin(TICKER_PEPE).expect("fixture parses");
    assert_eq!(
        (pepe.id.as_str(), pepe.symbol.as_str()),
        ("pepe-pepe", "PEPE")
    );
    assert!(pepe.price > 0.0);
}

#[test]
fn binance_stands_in_with_names_logos_and_ranks() {
    let coins = crypto::parse_binance_coins(BINANCE_LIST).expect("fixture parses");
    assert!(!coins.is_empty());
    assert!(coins.windows(2).all(|pair| pair[0].rank <= pair[1].rank));
    let bitcoin = coins
        .iter()
        .find(|coin| coin.symbol == "BTC")
        .expect("bitcoin");
    assert_eq!(bitcoin.id, "btc-bitcoin", "the same id CoinPaprika uses");
    assert!(
        bitcoin
            .image_url
            .as_deref()
            .is_some_and(|url| url.starts_with("https://"))
    );
}

#[test]
fn both_lists_agree_on_bitcoin_within_a_few_percent() {
    let price = |coins: Vec<sajilo_api::crypto::CryptoCoin>| {
        coins
            .into_iter()
            .find(|coin| coin.id == "btc-bitcoin")
            .unwrap()
            .price
    };
    let a = price(crypto::parse_paprika_coins(TICKERS).unwrap());
    let b = price(crypto::parse_binance_coins(BINANCE_LIST).unwrap());
    assert!((a - b).abs() / a < 0.05, "{a} vs {b}");
}

#[test]
fn binance_charts_are_rising_seconds() {
    let day = crypto::parse_binance_klines(KLINES_1).expect("fixture parses");
    assert_eq!(day.len(), 96, "a day in quarter hours");
    let week = crypto::parse_binance_klines(KLINES_7).expect("fixture parses");
    assert_eq!(week.len(), 168, "a week by the hour");
    assert!(week.windows(2).all(|pair| pair[0].time < pair[1].time));
    assert!(week.iter().all(|point| point.price > 1000.0));
}

#[test]
fn coinpaprika_charts_a_year_by_the_day() {
    let year = crypto::parse_paprika_chart(HISTORY_365, "btc-bitcoin", 365, now()).unwrap();
    assert_eq!(year.source, crypto::COINPAPRIKA_SOURCE);
    let span = year.points.last().unwrap().time - year.points[0].time;
    assert!(span > 300 * 86_400, "a year of daily prices");
}

#[test]
fn search_finds_coins_without_logos() {
    let hits = crypto::parse_search(SEARCH_PEPE).expect("fixture parses");
    assert_eq!(hits[0].id, "pepe-pepe");
    assert!(hits.len() <= crypto::MAX_SEARCH_HITS);
}

#[test]
fn old_coingecko_stars_find_their_coinpaprika_ids() {
    let coins = crypto::parse_paprika_coins(TICKERS).unwrap();
    assert_eq!(
        crypto::current_id("bitcoin", &coins).as_deref(),
        Some("btc-bitcoin")
    );
    assert_eq!(
        crypto::current_id("ripple", &coins).as_deref(),
        Some("xrp-xrp")
    );
    assert_eq!(
        crypto::current_id("btc-bitcoin", &coins),
        None,
        "already current"
    );
    assert_eq!(crypto::current_id("no-such-coin-anywhere", &coins), None);
    assert_eq!(crypto::id_for("BNB", "Binance Coin"), "bnb-binance-coin");
}

#[test]
fn junk_and_errors_are_rejected() {
    assert!(crypto::parse_paprika_coins("<html>").is_err());
    assert!(crypto::parse_binance_coins("<html>").is_err());
    assert!(crypto::parse_binance_klines("[]").is_err());
    assert!(crypto::parse_binance_klines(r#"{"code":-1121,"msg":"Invalid symbol."}"#).is_err());
}

#[test]
fn coinpaprikas_list_borrows_binances_logos() {
    let snapshot = crypto::list(
        crypto::parse_paprika_coins(TICKERS),
        crypto::parse_binance_coins(BINANCE_LIST),
        now(),
    )
    .unwrap();
    assert_eq!(snapshot.source, crypto::COINPAPRIKA_SOURCE);
    let logo = |id: &str| {
        snapshot
            .coins
            .iter()
            .find(|coin| coin.id == id)
            .and_then(|coin| coin.image_url.clone())
    };
    assert!(logo("btc-bitcoin").is_some());
    assert!(
        logo("link-chainlink").is_some(),
        "Chainlink and ChainLink match"
    );
    let with_logos = snapshot
        .coins
        .iter()
        .filter(|coin| coin.image_url.is_some())
        .count();
    assert!(with_logos >= 20, "{with_logos} coins got a logo");
}
