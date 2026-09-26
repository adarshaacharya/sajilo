//! Crypto prices, from CoinGecko with Kraken behind it.
//!
//! CoinGecko aggregates hundreds of exchanges into one market list: price,
//! market value, volume, the all-time high and a week of hourly prices, for
//! the top coins in one request and without a key. Kraken's public ticker is
//! an exchange's own price for a fixed set of major coins; it has no market
//! value or week of prices, so it only stands in when CoinGecko is down.
//!
//! Every figure is in US dollars. Buying, selling or holding crypto is not
//! legal in Nepal, and a rupee price would read like one a Nepali could trade
//! at.

use chrono::{DateTime, Utc};
use sajilo_api::crypto::{
    CryptoChart, CryptoCoin, CryptoPricePoint, CryptoSearchHit, CryptoSnapshot,
};
use sajilo_api::load_state::Freshness;
use serde::Deserialize;
use std::collections::HashMap;

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const COINGECKO_SOURCE: &str = "CoinGecko";
pub const KRAKEN_SOURCE: &str = "Kraken";

/// The top coins by market value, with a week of hourly prices each. 250 is
/// CoinGecko's largest page, still one request, and covers nearly any coin
/// someone in Nepal actually follows.
const COINGECKO_MARKETS: &str = "https://api.coingecko.com/api/v3/coins/markets\
?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true\
&price_change_percentage=24h,7d";
/// The same market data for named coins, whatever their rank: a starred coin
/// that slipped out of the top list, or one opened from search.
const COINGECKO_MARKETS_BY_ID: &str = "https://api.coingecko.com/api/v3/coins/markets\
?vs_currency=usd&sparkline=true&price_change_percentage=24h,7d";
/// Every coin CoinGecko knows, by name or ticker.
const COINGECKO_SEARCH: &str = "https://api.coingecko.com/api/v3/search";
const COINGECKO_CHART: &str = "https://api.coingecko.com/api/v3/coins";
const KRAKEN_TICKER: &str = "https://api.kraken.com/0/public/Ticker";

/// How many coins one by-id request may name, and how many search hits are
/// kept: enough for anyone's starred list, short enough for one small reply.
pub const MAX_COINS_BY_ID: usize = 50;
pub const MAX_SEARCH_HITS: usize = 20;

/// The spans a chart can be asked for, in days.
pub const CHART_DAYS: [u32; 4] = [1, 7, 30, 365];

/// The coins Kraken is asked for when CoinGecko is down: its pair, and the
/// CoinGecko id, ticker and name the list is keyed by. Kraken answers under
/// its own names for the older pairs (`XXBTZUSD` for `XBTUSD`), so both are
/// kept.
const KRAKEN_COINS: [(&str, &str, &str, &str, &str); 12] = [
    ("XBTUSD", "XXBTZUSD", "bitcoin", "BTC", "Bitcoin"),
    ("ETHUSD", "XETHZUSD", "ethereum", "ETH", "Ethereum"),
    ("XRPUSD", "XXRPZUSD", "ripple", "XRP", "XRP"),
    ("SOLUSD", "SOLUSD", "solana", "SOL", "Solana"),
    ("DOGEUSD", "XDGUSD", "dogecoin", "DOGE", "Dogecoin"),
    ("ADAUSD", "ADAUSD", "cardano", "ADA", "Cardano"),
    ("TRXUSD", "TRXUSD", "tron", "TRX", "TRON"),
    ("LINKUSD", "LINKUSD", "chainlink", "LINK", "Chainlink"),
    ("AVAXUSD", "AVAXUSD", "avalanche-2", "AVAX", "Avalanche"),
    ("XLMUSD", "XXLMZUSD", "stellar", "XLM", "Stellar"),
    ("LTCUSD", "XLTCZUSD", "litecoin", "LTC", "Litecoin"),
    ("DOTUSD", "DOTUSD", "polkadot", "DOT", "Polkadot"),
];

pub async fn fetch(client: &HttpClient, now: DateTime<Utc>) -> Result<CryptoSnapshot> {
    let primary = match client.get_text(COINGECKO_SOURCE, COINGECKO_MARKETS).await {
        Ok(body) => parse_coingecko(&body, now),
        Err(error) => Err(error),
    };
    if primary.is_ok() {
        return primary;
    }
    let pairs: Vec<&str> = KRAKEN_COINS.iter().map(|coin| coin.0).collect();
    let url = format!("{KRAKEN_TICKER}?pair={}", pairs.join(","));
    let fallback = match client.get_text(KRAKEN_SOURCE, &url).await {
        Ok(body) => parse_kraken(&body, now),
        Err(error) => Err(error),
    };
    // Both down: the primary's reason is the one worth reporting.
    fallback.or(primary)
}

/// One coin's price over `days`: CoinGecko's hourly points for up to 90 days,
/// daily beyond. `days` must be one of [`CHART_DAYS`].
pub async fn fetch_chart(
    client: &HttpClient,
    id: &str,
    days: u32,
    now: DateTime<Utc>,
) -> Result<CryptoChart> {
    if !CHART_DAYS.contains(&days) {
        return Err(ProviderError::parse(
            COINGECKO_SOURCE,
            format!("unsupported chart span: {days} days"),
        ));
    }
    if !valid_id(id) {
        return Err(ProviderError::parse(COINGECKO_SOURCE, "invalid coin id"));
    }
    let url = format!("{COINGECKO_CHART}/{id}/market_chart?vs_currency=usd&days={days}");
    let body = client.get_text(COINGECKO_SOURCE, &url).await?;
    parse_chart(&body, id, days, now)
}

/// A CoinGecko coin id: lower case letters, digits and dashes. Anything else
/// never reaches a URL.
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

/// Market data for these coins, whatever their rank. Unknown or malformed ids
/// are dropped rather than failing the rest.
pub async fn fetch_coins(client: &HttpClient, ids: &[String]) -> Result<Vec<CryptoCoin>> {
    let ids: Vec<&str> = ids
        .iter()
        .map(String::as_str)
        .filter(|id| valid_id(id))
        .take(MAX_COINS_BY_ID)
        .collect();
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let url = format!("{COINGECKO_MARKETS_BY_ID}&ids={}", ids.join(","));
    let body = client.get_text(COINGECKO_SOURCE, &url).await?;
    parse_coingecko_coins(&body)
}

/// Coins whose name or ticker matches, across everything CoinGecko lists.
/// Fewer than two characters matches too much to be useful, so asks nothing.
pub async fn search(client: &HttpClient, query: &str) -> Result<Vec<CryptoSearchHit>> {
    let query = query.trim();
    if query.chars().count() < 2 {
        return Ok(Vec::new());
    }
    let url = reqwest::Url::parse_with_params(COINGECKO_SEARCH, &[("query", query)])
        .map_err(|error| ProviderError::parse(COINGECKO_SOURCE, error.to_string()))?;
    let body = client.get_text(COINGECKO_SOURCE, url.as_str()).await?;
    parse_search(&body)
}

// CoinGecko's and Kraken's payloads, modelled separately from the DTO so a
// field rename upstream cannot reach into the contract the app is built on.

#[derive(Deserialize)]
struct CoinGeckoCoin {
    id: String,
    symbol: String,
    name: String,
    image: Option<String>,
    market_cap_rank: Option<u32>,
    current_price: Option<f64>,
    market_cap: Option<f64>,
    total_volume: Option<f64>,
    high_24h: Option<f64>,
    low_24h: Option<f64>,
    price_change_percentage_24h_in_currency: Option<f64>,
    price_change_percentage_7d_in_currency: Option<f64>,
    circulating_supply: Option<f64>,
    max_supply: Option<f64>,
    ath: Option<f64>,
    ath_change_percentage: Option<f64>,
    ath_date: Option<String>,
    sparkline_in_7d: Option<Sparkline>,
}

#[derive(Deserialize)]
struct Sparkline {
    #[serde(default)]
    price: Vec<Option<f64>>,
}

#[derive(Deserialize)]
struct CoinGeckoSearch {
    #[serde(default)]
    coins: Vec<CoinGeckoSearchCoin>,
}

#[derive(Deserialize)]
struct CoinGeckoSearchCoin {
    id: String,
    name: String,
    symbol: String,
    market_cap_rank: Option<u32>,
    large: Option<String>,
    thumb: Option<String>,
}

#[derive(Deserialize)]
struct CoinGeckoChart {
    prices: Vec<(f64, Option<f64>)>,
}

#[derive(Deserialize)]
struct KrakenResponse {
    #[serde(default)]
    error: Vec<String>,
    result: Option<HashMap<String, KrakenTicker>>,
}

/// Kraken's ticker, as strings: `c` last trade `[price, lot]`; `h` and `l`
/// high and low `[today, last 24 hours]`; `v` volume and `p` volume-weighted
/// price, both `[today, last 24 hours]`.
#[derive(Deserialize)]
struct KrakenTicker {
    c: Vec<String>,
    h: Vec<String>,
    l: Vec<String>,
    v: Vec<String>,
    p: Vec<String>,
}

pub fn parse_coingecko(body: &str, now: DateTime<Utc>) -> Result<CryptoSnapshot> {
    snapshot(parse_coingecko_coins(body)?, COINGECKO_SOURCE, now)
}

/// CoinGecko's market list as coins. An empty list is an answer here, not an
/// error: a by-id request for coins it no longer knows returns one.
pub fn parse_coingecko_coins(body: &str) -> Result<Vec<CryptoCoin>> {
    let coins: Vec<CoinGeckoCoin> = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(COINGECKO_SOURCE, error.to_string()))?;
    Ok(coins
        .into_iter()
        .filter_map(|coin| {
            let price = coin.current_price.filter(|price| *price > 0.0)?;
            Some(CryptoCoin {
                id: coin.id,
                symbol: coin.symbol.to_uppercase(),
                name: coin.name,
                image_url: coin.image.filter(|url| url.starts_with("https://")),
                rank: coin.market_cap_rank,
                price,
                change_24h: coin.price_change_percentage_24h_in_currency,
                change_7d: coin.price_change_percentage_7d_in_currency,
                market_cap: coin.market_cap.filter(|cap| *cap > 0.0),
                volume_24h: coin.total_volume,
                high_24h: coin.high_24h,
                low_24h: coin.low_24h,
                circulating_supply: coin.circulating_supply,
                max_supply: coin.max_supply,
                all_time_high: coin.ath,
                from_all_time_high: coin.ath_change_percentage,
                all_time_high_date: coin
                    .ath_date
                    .and_then(|date| date.get(..10).map(str::to_owned)),
                sparkline: coin
                    .sparkline_in_7d
                    .map(|line| line.price.into_iter().flatten().collect())
                    .unwrap_or_default(),
            })
        })
        .collect())
}

pub fn parse_kraken(body: &str, now: DateTime<Utc>) -> Result<CryptoSnapshot> {
    let response: KrakenResponse = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(KRAKEN_SOURCE, error.to_string()))?;
    if !response.error.is_empty() {
        return Err(ProviderError::parse(
            KRAKEN_SOURCE,
            response.error.join("; "),
        ));
    }
    let tickers = response.result.unwrap_or_default();
    let number =
        |values: &[String], index: usize| -> Option<f64> { values.get(index)?.parse::<f64>().ok() };
    let coins = KRAKEN_COINS
        .iter()
        .filter_map(|(pair, answered_as, id, symbol, name)| {
            let ticker = tickers.get(*answered_as).or_else(|| tickers.get(*pair))?;
            let price = number(&ticker.c, 0).filter(|price| *price > 0.0)?;
            let volume = number(&ticker.v, 1).zip(number(&ticker.p, 1));
            Some(CryptoCoin {
                id: (*id).to_owned(),
                symbol: (*symbol).to_owned(),
                name: (*name).to_owned(),
                image_url: None,
                rank: None,
                price,
                // Kraken's day starts at midnight UTC rather than 24 hours
                // ago, so there is no honest 24-hour change to give.
                change_24h: None,
                change_7d: None,
                market_cap: None,
                volume_24h: volume.map(|(amount, average)| amount * average),
                high_24h: number(&ticker.h, 1),
                low_24h: number(&ticker.l, 1),
                circulating_supply: None,
                max_supply: None,
                all_time_high: None,
                from_all_time_high: None,
                all_time_high_date: None,
                sparkline: Vec::new(),
            })
        })
        .collect();
    snapshot(coins, KRAKEN_SOURCE, now)
}

pub fn parse_chart(body: &str, id: &str, days: u32, now: DateTime<Utc>) -> Result<CryptoChart> {
    let chart: CoinGeckoChart = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(COINGECKO_SOURCE, error.to_string()))?;
    let mut points: Vec<CryptoPricePoint> = chart
        .prices
        .into_iter()
        .filter_map(|(millis, price)| {
            let price = price.filter(|price| *price > 0.0)?;
            let seconds = (millis / 1000.0).round();
            if !(0.0..=f64::from(u32::MAX)).contains(&seconds) {
                return None;
            }
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            let time = seconds as u32;
            Some(CryptoPricePoint { time, price })
        })
        .collect();
    // A chart needs strictly increasing times; the last point can repeat the
    // one before it to the second.
    points.sort_by_key(|point| point.time);
    points.dedup_by_key(|point| point.time);
    if points.len() < 2 {
        return Err(ProviderError::parse(
            COINGECKO_SOURCE,
            "chart has no prices",
        ));
    }
    Ok(CryptoChart {
        id: id.to_owned(),
        days,
        points,
        source: COINGECKO_SOURCE.to_owned(),
        freshness: Freshness::new(now),
    })
}

/// CoinGecko's search, coins only, best match first as it ranks them.
pub fn parse_search(body: &str) -> Result<Vec<CryptoSearchHit>> {
    let response: CoinGeckoSearch = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(COINGECKO_SOURCE, error.to_string()))?;
    Ok(response
        .coins
        .into_iter()
        .filter(|coin| valid_id(&coin.id))
        .take(MAX_SEARCH_HITS)
        .map(|coin| CryptoSearchHit {
            id: coin.id,
            symbol: coin.symbol.to_uppercase(),
            name: coin.name,
            rank: coin.market_cap_rank,
            image_url: coin
                .large
                .or(coin.thumb)
                .filter(|url| url.starts_with("https://")),
        })
        .collect())
}

fn snapshot(
    coins: Vec<CryptoCoin>,
    source: &'static str,
    now: DateTime<Utc>,
) -> Result<CryptoSnapshot> {
    if coins.is_empty() {
        return Err(ProviderError::parse(source, "no coins in the response"));
    }
    Ok(CryptoSnapshot {
        coins,
        source: source.to_owned(),
        freshness: Freshness::new(now),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    const MARKETS: &str = include_str!("../../../fixtures/coingecko/markets.json");
    const CHART_1: &str = include_str!("../../../fixtures/coingecko/market-chart-bitcoin-1.json");
    const CHART_365: &str =
        include_str!("../../../fixtures/coingecko/market-chart-bitcoin-365.json");
    const KRAKEN: &str = include_str!("../../../fixtures/kraken/ticker.json");

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 9, 26, 12, 0, 0).unwrap()
    }

    #[test]
    fn the_market_list_reads_every_coin_with_its_week() {
        let snapshot = parse_coingecko(MARKETS, now()).unwrap();
        assert_eq!(snapshot.source, COINGECKO_SOURCE);
        assert_eq!(snapshot.coins.len(), 50);
        let bitcoin = &snapshot.coins[0];
        assert_eq!(
            (bitcoin.id.as_str(), bitcoin.symbol.as_str(), bitcoin.rank),
            ("bitcoin", "BTC", Some(1))
        );
        assert!(bitcoin.price > 1000.0);
        assert!(bitcoin.market_cap.is_some() && bitcoin.change_24h.is_some());
        assert!(bitcoin.sparkline.len() > 100, "a week of hourly prices");
        assert_eq!(
            bitcoin.all_time_high_date.as_deref().map(str::len),
            Some(10)
        );
        assert!(
            snapshot
                .coins
                .iter()
                .all(|coin| coin.symbol == coin.symbol.to_uppercase())
        );
    }

    #[test]
    fn kraken_stands_in_with_the_major_coins() {
        let snapshot = parse_kraken(KRAKEN, now()).unwrap();
        assert_eq!(snapshot.source, KRAKEN_SOURCE);
        assert_eq!(snapshot.coins.len(), KRAKEN_COINS.len());
        let bitcoin = snapshot
            .coins
            .iter()
            .find(|coin| coin.id == "bitcoin")
            .unwrap();
        assert_eq!(bitcoin.symbol, "BTC");
        assert!(bitcoin.price > 1000.0);
        assert!(bitcoin.change_24h.is_none(), "no honest 24-hour change");
        assert!(bitcoin.volume_24h.is_some_and(|volume| volume > 0.0));
    }

    #[test]
    fn both_sources_agree_on_bitcoin_within_a_few_percent() {
        let gecko = parse_coingecko(MARKETS, now()).unwrap();
        let kraken = parse_kraken(KRAKEN, now()).unwrap();
        let price = |snapshot: &CryptoSnapshot| {
            snapshot
                .coins
                .iter()
                .find(|coin| coin.id == "bitcoin")
                .unwrap()
                .price
        };
        let (a, b) = (price(&gecko), price(&kraken));
        assert!((a - b).abs() / a < 0.05, "{a} vs {b}");
    }

    #[test]
    fn a_chart_reads_as_rising_seconds() {
        let day = parse_chart(CHART_1, "bitcoin", 1, now()).unwrap();
        assert!(day.points.len() > 200);
        assert!(
            day.points
                .windows(2)
                .all(|pair| pair[0].time < pair[1].time)
        );
        let year = parse_chart(CHART_365, "bitcoin", 365, now()).unwrap();
        let span = year.points.last().unwrap().time - year.points[0].time;
        assert!(span > 300 * 86_400, "a year of daily prices");
    }

    #[test]
    fn junk_and_errors_are_rejected() {
        assert!(parse_coingecko("<html>", now()).is_err());
        assert!(parse_coingecko("[]", now()).is_err());
        assert!(parse_kraken(r#"{"error":["EGeneral:Too many requests"]}"#, now()).is_err());
        assert!(parse_chart(r#"{"prices":[]}"#, "bitcoin", 7, now()).is_err());
    }
}
