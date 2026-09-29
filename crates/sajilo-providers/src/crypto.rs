//! Crypto prices, from CoinPaprika with Binance behind it, and charts from
//! Binance.
//!
//! CoinPaprika aggregates the market into one ranked list: price, market
//! value, volume, the 24-hour and 7-day moves and the all-time high, for the
//! top coins in one request and without a key. Binance's website list (the one
//! its own markets page reads) carries much the same, ranked, with each coin's
//! logo; it stands in when CoinPaprika is down, and lends its logos to
//! CoinPaprika's list, whose own logos only load on coinpaprika.com.
//!
//! Charts come from Binance's public market API: an exchange's own trades,
//! hourly for a week and daily for a year. A coin Binance doesn't trade gets
//! CoinPaprika's daily prices instead.
//!
//! CoinGecko was the source until it began refusing price requests from
//! Nepali networks (403 for markets and prices, while search still answered).
//! Both sources here were checked from Kathmandu.
//!
//! Every figure is in US dollars. Buying, selling or holding crypto is not
//! legal in Nepal, and a rupee price would read like one a Nepali could trade
//! at.

use std::collections::HashMap;

use chrono::{DateTime, Duration, Utc};
use sajilo_api::crypto::{
    CryptoChart, CryptoCoin, CryptoPricePoint, CryptoSearchHit, CryptoSnapshot,
};
use sajilo_api::load_state::Freshness;
use serde::Deserialize;

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const COINPAPRIKA_SOURCE: &str = "CoinPaprika";
pub const BINANCE_SOURCE: &str = "Binance";

/// The top coins by market value. 250 covers nearly any coin someone in
/// Nepal actually follows, in one request.
const PAPRIKA_TICKERS: &str = "https://api.coinpaprika.com/v1/tickers?quotes=USD&limit=250";
const PAPRIKA_TICKER: &str = "https://api.coinpaprika.com/v1/tickers";
const PAPRIKA_SEARCH: &str = "https://api.coinpaprika.com/v1/search/";
/// Binance's markets page list: every coin it trades, ranked, with names,
/// logos and market values. Not a documented API, so only ever a stand-in.
const BINANCE_LIST: &str = "https://www.binance.com/bapi/composite/v1/public/marketing/symbol/list";
const BINANCE_KLINES: &str = "https://api.binance.com/api/v3/klines";

/// How many coins the list keeps, how many one by-id request may name, and
/// how many search hits are kept.
pub const LIST_SIZE: usize = 250;
pub const MAX_COINS_BY_ID: usize = 50;
pub const MAX_SEARCH_HITS: usize = 20;

/// The spans a chart can be asked for, in days.
pub const CHART_DAYS: [u32; 4] = [1, 7, 30, 365];

/// CoinGecko ids saved before the switch whose CoinPaprika id doesn't end in
/// them; the rest are found by that ending (`bitcoin` → `btc-bitcoin`).
const RENAMED: [(&str, &str); 10] = [
    ("ripple", "xrp-xrp"),
    ("binancecoin", "bnb-binance-coin"),
    ("avalanche-2", "avax-avalanche"),
    ("the-open-network", "ton-toncoin"),
    ("matic-network", "matic-polygon"),
    ("staked-ether", "steth-lido-staked-ether"),
    ("usd-coin", "usdc-usd-coin"),
    ("bitcoin-cash", "bch-bitcoin-cash"),
    ("crypto-com-chain", "cro-cryptocom-chain"),
    ("internet-computer", "icp-internet-computer"),
];

/// The list: CoinPaprika's, with Binance's logos where the coins match, or
/// Binance's own when CoinPaprika is down.
pub async fn fetch(client: &HttpClient, now: DateTime<Utc>) -> Result<CryptoSnapshot> {
    let (paprika, binance) = tokio::join!(
        client.get_text(COINPAPRIKA_SOURCE, PAPRIKA_TICKERS),
        client.get_text(BINANCE_SOURCE, BINANCE_LIST),
    );
    list(
        paprika.and_then(|body| parse_paprika_coins(&body)),
        binance.and_then(|body| parse_binance_coins(&body)),
        now,
    )
}

/// The list from both sources' answers: CoinPaprika's with Binance's logos
/// lent where the coins match, or Binance's own when CoinPaprika failed.
pub fn list(
    paprika: Result<Vec<CryptoCoin>>,
    binance: Result<Vec<CryptoCoin>>,
    now: DateTime<Utc>,
) -> Result<CryptoSnapshot> {
    match paprika {
        Ok(mut coins) => {
            if let Ok(listed) = &binance {
                lend_logos(&mut coins, listed);
            }
            snapshot(coins, COINPAPRIKA_SOURCE, now)
        }
        // Both down: CoinPaprika's reason is the one worth reporting.
        Err(error) => binance
            .map_err(|_| error)
            .and_then(|coins| snapshot(coins, BINANCE_SOURCE, now)),
    }
}

/// Market data for these coins, whatever their rank: a starred coin that
/// slipped out of the top list, or one opened from search. Each comes with a
/// week of hourly prices from Binance where it trades there, for its line.
/// Unknown or malformed ids are dropped rather than failing the rest.
pub async fn fetch_coins(client: &HttpClient, ids: &[String]) -> Result<Vec<CryptoCoin>> {
    let mut lookups = tokio::task::JoinSet::new();
    for (order, id) in ids
        .iter()
        .filter(|id| valid_id(id))
        .take(MAX_COINS_BY_ID)
        .enumerate()
    {
        let (client, id) = (client.clone(), id.clone());
        lookups.spawn(async move {
            let url = format!("{PAPRIKA_TICKER}/{id}?quotes=USD");
            let body = client.get_text(COINPAPRIKA_SOURCE, &url).await.ok()?;
            let mut coin = parse_paprika_coin(&body).ok()?;
            if let Some(symbol) = symbol_of(&coin.id)
                && let Ok(week) = binance_klines(&client, &symbol, "1h", 168).await
            {
                coin.sparkline = week.into_iter().map(|point| point.price).collect();
            }
            Some((order, coin))
        });
    }
    let mut found: Vec<(usize, CryptoCoin)> =
        lookups.join_all().await.into_iter().flatten().collect();
    // In the order asked for, whichever answered first.
    found.sort_by_key(|(order, _)| *order);
    Ok(found.into_iter().map(|(_, coin)| coin).collect())
}

/// Coins whose name or ticker matches, across everything CoinPaprika lists.
/// Fewer than two characters matches too much to be useful, so asks nothing.
pub async fn search(client: &HttpClient, query: &str) -> Result<Vec<CryptoSearchHit>> {
    let query = query.trim();
    if query.chars().count() < 2 {
        return Ok(Vec::new());
    }
    let url = reqwest::Url::parse_with_params(
        PAPRIKA_SEARCH,
        &[("q", query), ("c", "currencies"), ("limit", "20")],
    )
    .map_err(|error| ProviderError::parse(COINPAPRIKA_SOURCE, error.to_string()))?;
    let body = client.get_text(COINPAPRIKA_SOURCE, url.as_str()).await?;
    parse_search(&body)
}

/// One coin's price over `days`, from Binance's trades where it trades
/// there, else CoinPaprika's daily prices. `days` must be one of
/// [`CHART_DAYS`].
pub async fn fetch_chart(
    client: &HttpClient,
    id: &str,
    days: u32,
    now: DateTime<Utc>,
) -> Result<CryptoChart> {
    if !CHART_DAYS.contains(&days) {
        return Err(ProviderError::parse(
            BINANCE_SOURCE,
            format!("unsupported chart span: {days} days"),
        ));
    }
    if !valid_id(id) {
        return Err(ProviderError::parse(BINANCE_SOURCE, "invalid coin id"));
    }
    let (interval, count) = chart_steps(days);
    if let Some(symbol) = symbol_of(id)
        && let Ok(points) = binance_klines(client, &symbol, interval, count).await
    {
        return Ok(chart(id, days, points, BINANCE_SOURCE, now));
    }
    // CoinPaprika's free history: hourly for the last day, daily within the
    // last year (a day short of it, to stay inside the allowance).
    let (start, step) = if days == 1 {
        (now - Duration::days(1), "1h")
    } else {
        (now - Duration::days(i64::from(days.min(364))), "1d")
    };
    let url = format!(
        "{PAPRIKA_TICKER}/{id}/historical?start={}&interval={step}",
        start.format("%Y-%m-%dT%H:%M:%SZ")
    );
    let body = client.get_text(COINPAPRIKA_SOURCE, &url).await?;
    parse_paprika_chart(&body, id, days, now)
}

/// Binance candles for a span: a day in quarter hours, a week by the hour,
/// a month in four-hour steps, a year by the day.
fn chart_steps(days: u32) -> (&'static str, u32) {
    match days {
        1 => ("15m", 96),
        7 => ("1h", 168),
        30 => ("4h", 180),
        _ => ("1d", 365),
    }
}

async fn binance_klines(
    client: &HttpClient,
    symbol: &str,
    interval: &str,
    count: u32,
) -> Result<Vec<CryptoPricePoint>> {
    let url = format!("{BINANCE_KLINES}?symbol={symbol}USDT&interval={interval}&limit={count}");
    let body = client.get_text(BINANCE_SOURCE, &url).await?;
    parse_binance_klines(&body)
}

/// The ticker a coin trades under on Binance, from its id's first part
/// (`btc-bitcoin` → `BTC`). None for dollar stablecoins, which Binance prices
/// against themselves.
fn symbol_of(id: &str) -> Option<String> {
    let symbol = id.split('-').next()?.to_ascii_uppercase();
    (!symbol.is_empty() && !matches!(symbol.as_str(), "USDT" | "USDC" | "DAI" | "FDUSD"))
        .then_some(symbol)
}

/// A coin id: lower case letters, digits and dashes. Anything else never
/// reaches a URL.
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

/// A CoinPaprika-style id for a coin known only by ticker and name, so a coin
/// from Binance's list keeps the same id (and its star) as from CoinPaprika's:
/// `BTC`, `Bitcoin` → `btc-bitcoin`.
pub fn id_for(symbol: &str, name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let slug = slug
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    format!("{}-{slug}", symbol.to_lowercase())
}

/// The CoinPaprika id for a coin starred under its old CoinGecko id, if
/// `coins` has it. `None` when `id` is already current or can't be matched.
pub fn current_id(id: &str, coins: &[CryptoCoin]) -> Option<String> {
    if coins.iter().any(|coin| coin.id == id) {
        return None;
    }
    if let Some((_, renamed)) = RENAMED.iter().find(|(old, _)| *old == id) {
        return Some((*renamed).to_owned());
    }
    let ending = format!("-{id}");
    coins
        .iter()
        .find(|coin| coin.id.ends_with(&ending))
        .map(|coin| coin.id.clone())
}

/// Gives CoinPaprika's coins Binance's logos, where a coin on both has the
/// same ticker and a matching name. A shared ticker alone can be two
/// different coins; names differ in small ways (`Chainlink`, `ChainLink`;
/// `Polygon`, `Polygon Ecosystem Token`), so one name starting with the
/// other, letters and digits only, counts as a match.
fn lend_logos(coins: &mut [CryptoCoin], binance: &[CryptoCoin]) {
    let plain = |name: &str| -> String {
        name.chars()
            .filter(char::is_ascii_alphanumeric)
            .collect::<String>()
            .to_ascii_lowercase()
    };
    let logos: HashMap<&str, (String, &str)> = binance
        .iter()
        .filter_map(|coin| {
            let logo = coin.image_url.as_deref()?;
            Some((coin.symbol.as_str(), (plain(&coin.name), logo)))
        })
        .collect();
    for coin in coins.iter_mut().filter(|coin| coin.image_url.is_none()) {
        let Some((name, logo)) = logos.get(coin.symbol.as_str()) else {
            continue;
        };
        let ours = plain(&coin.name);
        if !ours.is_empty() && (name.starts_with(&ours) || ours.starts_with(name.as_str())) {
            coin.image_url = Some((*logo).to_owned());
        }
    }
}

// The sources' payloads, modelled separately from the DTO so a field rename
// upstream cannot reach into the contract the app is built on.

#[derive(Deserialize)]
struct PaprikaTicker {
    id: String,
    name: String,
    symbol: String,
    rank: Option<u32>,
    circulating_supply: Option<f64>,
    max_supply: Option<f64>,
    quotes: HashMap<String, PaprikaQuote>,
}

#[derive(Deserialize)]
struct PaprikaQuote {
    price: Option<f64>,
    volume_24h: Option<f64>,
    market_cap: Option<f64>,
    percent_change_24h: Option<f64>,
    percent_change_7d: Option<f64>,
    ath_price: Option<f64>,
    ath_date: Option<String>,
    percent_from_price_ath: Option<f64>,
}

#[derive(Deserialize)]
struct PaprikaSearch {
    #[serde(default)]
    currencies: Vec<PaprikaSearchCoin>,
}

#[derive(Deserialize)]
struct PaprikaSearchCoin {
    id: String,
    name: String,
    symbol: String,
    rank: Option<u32>,
    #[serde(default = "active")]
    is_active: bool,
}

const fn active() -> bool {
    true
}

#[derive(Deserialize)]
struct PaprikaPoint {
    timestamp: DateTime<Utc>,
    price: Option<f64>,
}

#[derive(Deserialize)]
struct BinanceList {
    data: Option<Vec<BinanceCoin>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BinanceCoin {
    /// The ticker, `BTC`; `symbol` is the pair, `BTCUSDT`.
    name: String,
    symbol: String,
    full_name: Option<String>,
    logo: Option<String>,
    rank: Option<u32>,
    price: Option<f64>,
    day_change: Option<f64>,
    market_cap: Option<f64>,
    volume: Option<f64>,
    circulating_supply: Option<f64>,
    max_supply: Option<f64>,
}

/// Coins in CoinPaprika's list, best rank first. Coins with no price are
/// left out.
pub fn parse_paprika_coins(body: &str) -> Result<Vec<CryptoCoin>> {
    let tickers: Vec<PaprikaTicker> = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(COINPAPRIKA_SOURCE, error.to_string()))?;
    Ok(tickers.into_iter().filter_map(paprika_coin).collect())
}

/// One coin from CoinPaprika's by-id ticker.
pub fn parse_paprika_coin(body: &str) -> Result<CryptoCoin> {
    let ticker: PaprikaTicker = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(COINPAPRIKA_SOURCE, error.to_string()))?;
    paprika_coin(ticker).ok_or_else(|| ProviderError::parse(COINPAPRIKA_SOURCE, "no price"))
}

fn paprika_coin(ticker: PaprikaTicker) -> Option<CryptoCoin> {
    let quote = ticker.quotes.get("USD")?;
    let price = quote.price.filter(|price| *price > 0.0)?;
    Some(CryptoCoin {
        id: ticker.id,
        symbol: ticker.symbol.to_uppercase(),
        name: ticker.name,
        image_url: None,
        rank: ticker.rank.filter(|rank| *rank > 0),
        price,
        change_24h: quote.percent_change_24h,
        change_7d: quote.percent_change_7d,
        market_cap: quote.market_cap.filter(|cap| *cap > 0.0),
        volume_24h: quote.volume_24h,
        // CoinPaprika gives no 24-hour high and low.
        high_24h: None,
        low_24h: None,
        circulating_supply: ticker.circulating_supply.filter(|supply| *supply > 0.0),
        max_supply: ticker.max_supply.filter(|supply| *supply > 0.0),
        all_time_high: quote.ath_price,
        from_all_time_high: quote.percent_from_price_ath,
        all_time_high_date: quote
            .ath_date
            .as_deref()
            .and_then(|date| date.get(..10).map(str::to_owned)),
        sparkline: Vec::new(),
    })
}

/// The coins in Binance's list that trade against the dollar, best rank
/// first, up to [`LIST_SIZE`].
pub fn parse_binance_coins(body: &str) -> Result<Vec<CryptoCoin>> {
    let list: BinanceList = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(BINANCE_SOURCE, error.to_string()))?;
    let mut coins: Vec<CryptoCoin> = list
        .data
        .unwrap_or_default()
        .into_iter()
        .filter(|coin| coin.symbol.ends_with("USDT"))
        .filter_map(|coin| {
            let price = coin.price.filter(|price| *price > 0.0)?;
            let symbol = coin.name.to_uppercase();
            let name = coin
                .full_name
                .filter(|name| !name.trim().is_empty())
                .unwrap_or_else(|| symbol.clone());
            Some(CryptoCoin {
                id: id_for(&symbol, &name),
                symbol,
                name,
                image_url: coin.logo.filter(|url| url.starts_with("https://")),
                rank: coin.rank.filter(|rank| *rank > 0),
                price,
                change_24h: coin.day_change,
                change_7d: None,
                market_cap: coin.market_cap.filter(|cap| *cap > 0.0),
                volume_24h: coin.volume,
                high_24h: None,
                low_24h: None,
                circulating_supply: coin.circulating_supply,
                max_supply: coin.max_supply,
                all_time_high: None,
                from_all_time_high: None,
                all_time_high_date: None,
                sparkline: Vec::new(),
            })
        })
        .collect();
    coins.sort_by_key(|coin| coin.rank.unwrap_or(u32::MAX));
    coins.truncate(LIST_SIZE);
    Ok(coins)
}

/// A chart from Binance candles.
pub fn parse_binance_chart(
    body: &str,
    id: &str,
    days: u32,
    now: DateTime<Utc>,
) -> Result<CryptoChart> {
    Ok(chart(
        id,
        days,
        parse_binance_klines(body)?,
        BINANCE_SOURCE,
        now,
    ))
}

/// Binance candles as prices at each candle's close: `[open time, open,
/// high, low, close, …]`, times in milliseconds and prices as strings.
pub fn parse_binance_klines(body: &str) -> Result<Vec<CryptoPricePoint>> {
    let candles: Vec<Vec<serde_json::Value>> = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(BINANCE_SOURCE, error.to_string()))?;
    let points = candles
        .iter()
        .filter_map(|candle| {
            let millis = candle.first()?.as_f64()?;
            let price = candle.get(4)?.as_str()?.parse::<f64>().ok()?;
            point(millis / 1000.0, price)
        })
        .collect();
    tidy(points, BINANCE_SOURCE)
}

pub fn parse_paprika_chart(
    body: &str,
    id: &str,
    days: u32,
    now: DateTime<Utc>,
) -> Result<CryptoChart> {
    let history: Vec<PaprikaPoint> = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(COINPAPRIKA_SOURCE, error.to_string()))?;
    #[allow(clippy::cast_precision_loss)]
    let points = history
        .into_iter()
        .filter_map(|entry| point(entry.timestamp.timestamp() as f64, entry.price?))
        .collect();
    Ok(chart(
        id,
        days,
        tidy(points, COINPAPRIKA_SOURCE)?,
        COINPAPRIKA_SOURCE,
        now,
    ))
}

fn point(seconds: f64, price: f64) -> Option<CryptoPricePoint> {
    let seconds = seconds.round();
    if price <= 0.0 || !(0.0..=f64::from(u32::MAX)).contains(&seconds) {
        return None;
    }
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let time = seconds as u32;
    Some(CryptoPricePoint { time, price })
}

/// A chart needs strictly increasing times and at least two of them.
fn tidy(mut points: Vec<CryptoPricePoint>, source: &'static str) -> Result<Vec<CryptoPricePoint>> {
    points.sort_by_key(|point| point.time);
    points.dedup_by_key(|point| point.time);
    if points.len() < 2 {
        return Err(ProviderError::parse(source, "chart has no prices"));
    }
    Ok(points)
}

fn chart(
    id: &str,
    days: u32,
    points: Vec<CryptoPricePoint>,
    source: &'static str,
    now: DateTime<Utc>,
) -> CryptoChart {
    CryptoChart {
        id: id.to_owned(),
        days,
        points,
        source: source.to_owned(),
        freshness: Freshness::new(now),
    }
}

/// CoinPaprika's search, active coins only, best match first as it ranks
/// them. It carries no logos.
pub fn parse_search(body: &str) -> Result<Vec<CryptoSearchHit>> {
    let response: PaprikaSearch = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(COINPAPRIKA_SOURCE, error.to_string()))?;
    Ok(response
        .currencies
        .into_iter()
        .filter(|coin| coin.is_active && valid_id(&coin.id))
        .take(MAX_SEARCH_HITS)
        .map(|coin| CryptoSearchHit {
            id: coin.id,
            symbol: coin.symbol.to_uppercase(),
            name: coin.name,
            rank: coin.rank.filter(|rank| *rank > 0),
            image_url: None,
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
