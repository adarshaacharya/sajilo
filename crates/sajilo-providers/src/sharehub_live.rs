//! NEPSE as it trades, from ShareHub's live board.
//!
//! ShareSansar's price table (see `sharesansar`) is the day's final record and
//! is only written after the session closes, so during trading hours it still
//! shows the previous day. ShareHub relays the exchange's live board: every
//! traded security's last price and change, and the headline indices, each
//! stamped with when it last moved. `overlay` lays that over the ShareSansar
//! snapshot whenever it is the newer of the two — which covers the session
//! itself and the hour or so after close before ShareSansar publishes.

use std::collections::HashMap;

use chrono::{DateTime, NaiveDateTime, Utc};
use sajilo_api::stocks::{MarketIndex, MarketMover, MoverBoard, StockMarketSnapshot, StockQuote};
use sajilo_core::nepal_time;
use serde::{Deserialize, Serialize};

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;
use crate::market_status::SHAREHUB_SOURCE as SOURCE_NAME;
use crate::sharesansar;

const QUOTES_URL: &str = "https://sharehubnepal.com/live/api/v2/nepselive/live-nepse";
const INDICES_URL: &str = "https://sharehubnepal.com/live/api/v2/nepselive/index";

/// The live board, as far as Sajilo needs it. Kept in the provider crate: it
/// is only ever an input to `overlay`, never shown on its own.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveMarket {
    pub quotes: Vec<LiveQuote>,
    pub indices: Vec<MarketIndex>,
    /// The latest trade on the board. `None` when no row carried a stamp.
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveQuote {
    pub symbol: String,
    pub name: Option<String>,
    pub ltp: f64,
    pub previous_close: f64,
    pub change: f64,
    pub change_percent: f64,
    pub open: Option<f64>,
    pub high: Option<f64>,
    pub low: Option<f64>,
    pub volume: Option<f64>,
    pub turnover: f64,
    pub transactions: Option<f64>,
}

pub async fn fetch(client: &HttpClient) -> Result<LiveMarket> {
    let (quotes, indices) = tokio::join!(
        client.get_text(SOURCE_NAME, QUOTES_URL),
        client.get_text(SOURCE_NAME, INDICES_URL),
    );
    parse(&quotes?, &indices?)
}

// Upstream shapes, modelled separately from the DTOs. Every field is optional
// so one odd row is skipped instead of losing the board.
#[derive(Deserialize)]
struct QuotesResponse {
    data: Option<Vec<RawQuote>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawQuote {
    symbol: Option<String>,
    security_name: Option<String>,
    last_traded_price: Option<f64>,
    previous_close: Option<f64>,
    change: Option<f64>,
    percentage_change: Option<f64>,
    open_price: Option<f64>,
    high_price: Option<f64>,
    low_price: Option<f64>,
    total_trade_quantity: Option<f64>,
    total_trade_value: Option<f64>,
    total_transactions: Option<f64>,
    last_updated_date_time: Option<String>,
}

/// `close` on this endpoint is the *previous* session's close;
/// `currentValue` is the index now, and `change` is measured between them.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawIndex {
    index: Option<String>,
    current_value: Option<f64>,
    change: Option<f64>,
    per_change: Option<f64>,
}

pub fn parse(quotes_body: &str, indices_body: &str) -> Result<LiveMarket> {
    let response: QuotesResponse = serde_json::from_str(quotes_body)
        .map_err(|error| ProviderError::parse(SOURCE_NAME, error.to_string()))?;
    let rows = response
        .data
        .ok_or_else(|| ProviderError::parse(SOURCE_NAME, "live board had no data"))?;

    let mut updated_at = None;
    let quotes = rows
        .into_iter()
        .filter_map(|row| {
            let symbol = row.symbol?.trim().to_ascii_uppercase();
            if symbol.is_empty() {
                return None;
            }
            if let Some(stamp) = row
                .last_updated_date_time
                .as_deref()
                .and_then(nepal_instant)
            {
                updated_at = updated_at.max(Some(stamp));
            }
            let ltp = row.last_traded_price?;
            let previous_close = row
                .previous_close
                .unwrap_or_else(|| ltp - row.change.unwrap_or(0.0));
            let change = row.change.unwrap_or(ltp - previous_close);
            Some(LiveQuote {
                symbol,
                name: row.security_name.filter(|name| !name.trim().is_empty()),
                ltp,
                previous_close,
                change,
                change_percent: row.percentage_change.unwrap_or_else(|| {
                    if previous_close > 0.0 {
                        change / previous_close * 100.0
                    } else {
                        0.0
                    }
                }),
                open: row.open_price,
                high: row.high_price,
                low: row.low_price,
                volume: row.total_trade_quantity,
                turnover: row.total_trade_value.unwrap_or(0.0),
                transactions: row.total_transactions,
            })
        })
        .collect::<Vec<_>>();
    if quotes.is_empty() {
        return Err(ProviderError::parse(
            SOURCE_NAME,
            "live board had no quotes",
        ));
    }

    // The index list is a nice-to-have on top of the quotes: if it fails to
    // parse, the quotes still go live and NEPSE keeps ShareSansar's figure.
    let indices = serde_json::from_str::<Vec<RawIndex>>(indices_body)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|row| {
            Some(MarketIndex {
                name: row.index?.trim().to_owned(),
                value: row.current_value?,
                change: row.change?,
                change_percent: row.per_change?,
                turnover: 0.0,
            })
        })
        .collect();

    Ok(LiveMarket {
        quotes,
        indices,
        updated_at,
    })
}

/// Lays the live board over a ShareSansar snapshot when the board is newer.
/// Returns whether it did.
///
/// "Newer" is by Nepal calendar day: the ShareSansar page is stamped with a
/// date only, so a live board from the same day or later wins. Figures that
/// only the final table carries (VWAP, 52-week range, averages) are kept;
/// the close is cleared, since the session may not have one yet.
pub fn overlay(snapshot: &mut StockMarketSnapshot, live: &LiveMarket) -> bool {
    let Some(updated_at) = live.updated_at else {
        return false;
    };
    let live_day = updated_at.with_timezone(&nepal_time::offset()).date_naive();
    let published_day = snapshot
        .freshness
        .source_timestamp
        .map(|stamp| stamp.date_naive());
    if published_day.is_some_and(|day| day > live_day) {
        return false;
    }

    let mut by_symbol: HashMap<&str, &LiveQuote> = live
        .quotes
        .iter()
        .map(|quote| (quote.symbol.as_str(), quote))
        .collect();
    for quote in &mut snapshot.quotes {
        if let Some(fresh) = by_symbol.remove(quote.symbol.as_str()) {
            apply(quote, fresh);
        }
    }
    // A security on the live board that the final table doesn't list yet —
    // a first day of trading — still belongs in the market.
    let mut added = by_symbol.into_values().collect::<Vec<_>>();
    added.sort_by(|a, b| a.symbol.cmp(&b.symbol));
    snapshot.quotes.extend(added.into_iter().map(new_quote));

    if let Some(nepse) = live
        .indices
        .iter()
        .find(|index| index.name.to_ascii_lowercase().starts_with("nepse"))
    {
        snapshot.nepse = Some(MarketIndex {
            // The day's turnover so far: every trade on the board.
            turnover: live.quotes.iter().map(|quote| quote.turnover).sum(),
            ..nepse.clone()
        });
    }

    snapshot.breadth = Some(sharesansar::breadth(&snapshot.quotes));
    snapshot.movers = movers(&snapshot.quotes, &snapshot.movers);
    snapshot.freshness.source_timestamp = Some(updated_at);
    true
}

fn apply(quote: &mut StockQuote, fresh: &LiveQuote) {
    quote.ltp = fresh.ltp;
    quote.previous_close = fresh.previous_close;
    quote.change = fresh.change;
    quote.change_percent = fresh.change_percent;
    quote.open = fresh.open.or(quote.open);
    quote.high = fresh.high.or(quote.high);
    quote.low = fresh.low.or(quote.low);
    quote.volume = fresh.volume;
    quote.turnover = fresh.turnover;
    quote.transactions = fresh.transactions;
    quote.close = None;
    quote.vwap = None;
    if quote.company_name.is_none() {
        quote.company_name.clone_from(&fresh.name);
    }
}

fn new_quote(fresh: &LiveQuote) -> StockQuote {
    StockQuote {
        symbol: fresh.symbol.clone(),
        company_name: fresh.name.clone(),
        ltp: fresh.ltp,
        previous_close: fresh.previous_close,
        change: fresh.change,
        change_percent: fresh.change_percent,
        open: fresh.open,
        high: fresh.high,
        low: fresh.low,
        close: None,
        vwap: None,
        volume: fresh.volume,
        turnover: fresh.turnover,
        transactions: fresh.transactions,
        week52_high: None,
        week52_low: None,
        average120_day: None,
        average180_day: None,
    }
}

/// The four leaderboards, re-ranked from live quotes. Each board keeps as many
/// rows as ShareSansar's did, so the screen doesn't change shape mid-session.
fn movers(quotes: &[StockQuote], previous: &[MarketMover]) -> Vec<MarketMover> {
    let size = |board: MoverBoard| match previous.iter().filter(|m| m.board == board).count() {
        0 => 10,
        count => count,
    };
    let traded = quotes
        .iter()
        .filter(|quote| quote.volume.is_none_or(|volume| volume > 0.0))
        .collect::<Vec<_>>();

    let board = |board: MoverBoard,
                 keep: &dyn Fn(&StockQuote) -> bool,
                 metric: &dyn Fn(&StockQuote) -> f64,
                 ascending: bool| {
        let mut rows = traded
            .iter()
            .copied()
            .filter(|quote| keep(quote))
            .collect::<Vec<_>>();
        rows.sort_by(|a, b| {
            let order = metric(a).total_cmp(&metric(b));
            if ascending { order } else { order.reverse() }
        });
        rows.into_iter()
            .take(size(board))
            .map(|quote| MarketMover {
                board,
                symbol: quote.symbol.clone(),
                ltp: quote.ltp,
                metric: metric(quote),
            })
            .collect::<Vec<_>>()
    };

    let mut all = board(
        MoverBoard::Gainers,
        &|quote| quote.change_percent > 0.0,
        &|quote| quote.change_percent,
        false,
    );
    all.extend(board(
        MoverBoard::Losers,
        &|quote| quote.change_percent < 0.0,
        &|quote| quote.change_percent,
        true,
    ));
    all.extend(board(
        MoverBoard::Turnover,
        &|_| true,
        &|quote| quote.turnover,
        false,
    ));
    all.extend(board(
        MoverBoard::Volume,
        &|quote| quote.volume.is_some(),
        &|quote| quote.volume.unwrap_or(0.0),
        false,
    ));
    all
}

/// `2026-09-16 14:59:59.99572`, Kathmandu wall-clock time.
fn nepal_instant(raw: &str) -> Option<DateTime<Utc>> {
    let normalized = raw.trim().get(..19)?.replacen(' ', "T", 1);
    NaiveDateTime::parse_from_str(&normalized, "%Y-%m-%dT%H:%M:%S")
        .ok()?
        .and_local_timezone(nepal_time::offset())
        .single()
        .map(|instant| instant.with_timezone(&Utc))
}

#[cfg(test)]
mod tests {
    use super::*;

    const QUOTES: &str = include_str!("../../../fixtures/sharehub/live-nepse.json");
    const INDICES: &str = include_str!("../../../fixtures/sharehub/index.json");

    fn live() -> LiveMarket {
        parse(QUOTES, INDICES).unwrap()
    }

    fn sharesansar() -> StockMarketSnapshot {
        let market = include_str!("../../../fixtures/sharesansar/market.html");
        let prices = include_str!("../../../fixtures/sharesansar/prices.html");
        sharesansar::parse(market, prices, "2026-09-14T12:00:00Z".parse().unwrap()).unwrap()
    }

    #[test]
    fn reads_every_security_on_the_board() {
        let live = live();
        assert_eq!(live.quotes.len(), 350);
        let nabil = live
            .quotes
            .iter()
            .find(|quote| quote.symbol == "NABIL")
            .unwrap();
        assert_eq!(nabil.ltp, 560.0);
        assert_eq!(nabil.previous_close, 560.0);
        assert_eq!(nabil.open, Some(565.0));
        // 14:59:59 on 16 September in Kathmandu.
        assert_eq!(
            live.updated_at,
            "2026-09-16T09:14:59Z".parse::<DateTime<Utc>>().ok()
        );
    }

    #[test]
    fn reads_the_current_index_not_yesterdays_close() {
        let live = live();
        let nepse = live
            .indices
            .iter()
            .find(|index| index.name == "NEPSE Index")
            .unwrap();
        assert_eq!(nepse.value, 2612.42);
        assert_eq!(nepse.change, -21.19);
        assert_eq!(nepse.change_percent, -0.8);
    }

    #[test]
    fn a_newer_board_replaces_the_final_table() {
        let mut snapshot = sharesansar();
        assert!(overlay(&mut snapshot, &live()));

        let nepse = snapshot.nepse.as_ref().unwrap();
        assert_eq!(nepse.value, 2612.42);
        let nabil = snapshot
            .quotes
            .iter()
            .find(|quote| quote.symbol == "NABIL")
            .unwrap();
        assert_eq!(nabil.ltp, 560.0);
        assert_eq!(nabil.close, None);
        assert_eq!(snapshot.freshness.source_timestamp, live().updated_at);

        let breadth = snapshot.breadth.unwrap();
        assert!(breadth.advanced + breadth.declined + breadth.unchanged > 0);
        let gainers = snapshot
            .movers
            .iter()
            .filter(|mover| mover.board == MoverBoard::Gainers)
            .collect::<Vec<_>>();
        assert!(!gainers.is_empty());
        assert!(
            gainers
                .windows(2)
                .all(|pair| pair[0].metric >= pair[1].metric)
        );
    }

    #[test]
    fn an_older_board_leaves_the_final_table_alone() {
        let mut snapshot = sharesansar();
        let before = snapshot.clone();
        let mut stale = live();
        stale.updated_at = "2026-09-10T09:00:00Z".parse().ok();
        assert!(!overlay(&mut snapshot, &stale));
        assert_eq!(snapshot, before);
    }

    #[test]
    fn a_broken_index_list_still_puts_quotes_live() {
        let live = parse(QUOTES, "<html>not json</html>").unwrap();
        assert!(live.indices.is_empty());
        assert!(!live.quotes.is_empty());
        assert!(parse("{}", INDICES).is_err());
    }
}
