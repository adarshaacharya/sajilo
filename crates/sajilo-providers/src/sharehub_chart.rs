//! A share's price chart, from ShareHub.
//!
//! Two feeds: the latest session trade by trade (`daily-graph/company/candle`),
//! and one row per trading day going back years (`price-history`), which the
//! longer ranges read. Both are public and keyless, and answer from Nepal.

use chrono::{DateTime, Duration, NaiveDate, Utc};
use sajilo_api::load_state::Freshness;
use sajilo_api::stocks::{StockChart, StockChartPoint};
use serde::Deserialize;

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;
use crate::market_status::SHAREHUB_SOURCE as SOURCE;

const SESSION_URL: &str = "https://sharehubnepal.com/live/api/v1/daily-graph/company/candle";
const HISTORY_URL: &str = "https://sharehubnepal.com/data/api/v1/price-history";

/// The ranges a chart can be asked for.
pub const CHART_RANGES: [&str; 6] = ["1d", "1w", "1m", "3m", "1y", "5y"];

/// Calendar days a range covers, and trading days to ask for to fill it (NEPSE
/// trades five days a week; the rest is slack for holidays).
fn span(range: &str) -> Option<(i64, u32)> {
    match range {
        "1w" => Some((7, 10)),
        "1m" => Some((31, 30)),
        "3m" => Some((92, 80)),
        "1y" => Some((366, 260)),
        "5y" => Some((5 * 366, 1300)),
        _ => None,
    }
}

/// A NEPSE symbol: capitals and digits, as `GBLBS` or `NIFRA`. Anything else
/// never reaches a URL.
pub fn valid_symbol(symbol: &str) -> bool {
    !symbol.is_empty()
        && symbol.len() <= 16
        && symbol
            .bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
}

pub async fn fetch(
    client: &HttpClient,
    symbol: &str,
    range: &str,
    now: DateTime<Utc>,
) -> Result<StockChart> {
    if !valid_symbol(symbol) {
        return Err(ProviderError::parse(SOURCE, "invalid symbol"));
    }
    if range == "1d" {
        let body = client
            .get_text(SOURCE, &format!("{SESSION_URL}/{symbol}"))
            .await?;
        return parse_session(&body, symbol, now);
    }
    let (_, size) = span(range)
        .ok_or_else(|| ProviderError::parse(SOURCE, format!("unsupported range: {range}")))?;
    let url = format!("{HISTORY_URL}?symbol={symbol}&size={size}");
    let body = client.get_text(SOURCE, &url).await?;
    parse_history(&body, symbol, range, now)
}

#[derive(Deserialize)]
struct Candle {
    time: i64,
    close: Option<f64>,
    #[serde(default)]
    volume: Option<f64>,
}

#[derive(Deserialize)]
struct HistoryResponse {
    data: Option<HistoryPage>,
}

#[derive(Deserialize)]
struct HistoryPage {
    #[serde(default)]
    content: Vec<HistoryDay>,
}

#[derive(Deserialize)]
struct HistoryDay {
    date: String,
    close: Option<f64>,
    #[serde(default)]
    volume: Option<f64>,
}

/// The latest session, trade by trade.
pub fn parse_session(body: &str, symbol: &str, now: DateTime<Utc>) -> Result<StockChart> {
    let candles: Vec<Candle> = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(SOURCE, error.to_string()))?;
    let points = candles
        .into_iter()
        .filter_map(|candle| {
            let price = candle.close.filter(|price| *price > 0.0)?;
            let time = u32::try_from(candle.time).ok()?;
            Some(StockChartPoint {
                time,
                price,
                volume: candle.volume.unwrap_or(0.0),
            })
        })
        .collect();
    chart(symbol, "1d", points, now)
}

/// One close per trading day, within the range's span of the latest day.
pub fn parse_history(
    body: &str,
    symbol: &str,
    range: &str,
    now: DateTime<Utc>,
) -> Result<StockChart> {
    let (days, _) = span(range)
        .ok_or_else(|| ProviderError::parse(SOURCE, format!("unsupported range: {range}")))?;
    let response: HistoryResponse = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(SOURCE, error.to_string()))?;
    let rows: Vec<(NaiveDate, f64, f64)> = response
        .data
        .map(|page| page.content)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|day| {
            let date = NaiveDate::parse_from_str(&day.date, "%Y-%m-%d").ok()?;
            let price = day.close.filter(|price| *price > 0.0)?;
            Some((date, price, day.volume.unwrap_or(0.0)))
        })
        .collect();
    let latest = rows.iter().map(|(date, ..)| *date).max();
    let points = rows
        .into_iter()
        .filter(|(date, ..)| latest.is_some_and(|latest| *date > latest - Duration::days(days)))
        .filter_map(|(date, price, volume)| {
            let time = u32::try_from(date.and_hms_opt(0, 0, 0)?.and_utc().timestamp()).ok()?;
            Some(StockChartPoint {
                time,
                price,
                volume,
            })
        })
        .collect();
    chart(symbol, range, points, now)
}

/// Oldest first, one point per moment, and at least two of them.
fn chart(
    symbol: &str,
    range: &str,
    mut points: Vec<StockChartPoint>,
    now: DateTime<Utc>,
) -> Result<StockChart> {
    points.sort_by_key(|point| point.time);
    points.dedup_by_key(|point| point.time);
    if points.len() < 2 {
        return Err(ProviderError::parse(SOURCE, "chart has no prices"));
    }
    Ok(StockChart {
        symbol: symbol.to_owned(),
        range: range.to_owned(),
        points,
        source: SOURCE.to_owned(),
        freshness: Freshness::new(now),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SESSION: &str = include_str!("../../../fixtures/sharehub/company-candle-GBLBS.json");
    const HISTORY: &str = include_str!("../../../fixtures/sharehub/price-history-GBLBS.json");

    fn now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-10-01T06:00:00Z")
            .unwrap()
            .with_timezone(&Utc)
    }

    #[test]
    fn a_session_reads_trade_by_trade() {
        let chart = parse_session(SESSION, "GBLBS", now()).unwrap();
        assert_eq!(chart.range, "1d");
        assert!(chart.points.len() > 5);
        assert!(
            chart
                .points
                .windows(2)
                .all(|pair| pair[0].time < pair[1].time)
        );
        assert!(chart.points.iter().all(|point| point.price > 100.0));
    }

    #[test]
    fn history_keeps_only_the_range_oldest_first() {
        let month = parse_history(HISTORY, "GBLBS", "1m", now()).unwrap();
        let week = parse_history(HISTORY, "GBLBS", "1w", now()).unwrap();
        assert!(week.points.len() < month.points.len());
        assert!(week.points.len() <= 7);
        assert!(
            month
                .points
                .windows(2)
                .all(|pair| pair[0].time < pair[1].time)
        );
        let last = month.points.last().unwrap();
        assert!((last.price - 665.0).abs() < 0.01, "the latest close");
    }

    #[test]
    fn bad_symbols_and_ranges_are_refused() {
        assert!(valid_symbol("GBLBS") && valid_symbol("NICA"));
        assert!(!valid_symbol("gblbs") && !valid_symbol("A/B") && !valid_symbol(""));
        assert!(parse_history(HISTORY, "GBLBS", "2d", now()).is_err());
        assert!(parse_session("[]", "GBLBS", now()).is_err());
        assert!(parse_history("<html>", "GBLBS", "1m", now()).is_err());
    }
}
