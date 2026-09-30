//! NEPSE market snapshot: ShareSansar's day table, with ShareHub's live board
//! laid over it while the exchange is trading.
//!
//! ShareSansar only writes its price table after the session closes, so on its
//! own the screen would show yesterday all day. The live board is asked for
//! whenever the exchange says it is open, or when ShareSansar has not yet
//! published today's table — and `overlay` uses it only if it is the newer of
//! the two. The final table still wins once it lands: it carries VWAP, the
//! 52-week range and averages the board does not.

use chrono::Utc;
use sajilo_api::load_state::LoadState;
use sajilo_api::stocks::{StockChart, StockMarketSnapshot};
use sajilo_core::nepal_time;
use sajilo_providers::sharehub_chart;
use sajilo_providers::sharehub_live::{self, LiveMarket};
use sajilo_providers::{HttpClient, sharesansar};
use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::{STOCKS_KEY, STOCKS_LIVE_KEY};

const MAX_AGE_SECS: i64 = 15 * 60;
const REFETCH_AFTER_SECS: i64 = 5 * 60;
/// The board moves every minute in session; a minute is as often as the
/// screen asks, so a page kept open sees each refresh land.
const LIVE_MAX_AGE_SECS: i64 = 10 * 60;
const LIVE_REFETCH_AFTER_SECS: i64 = 60;

/// A share's chart cache, by symbol and range.
type ChartFeeds = HashMap<(String, String), Arc<Feed<StockChart>>>;

pub struct StocksCache {
    feed: Feed<StockMarketSnapshot>,
    live: Feed<LiveMarket>,
    charts: Mutex<ChartFeeds>,
    client: HttpClient,
}

impl Default for StocksCache {
    fn default() -> Self {
        Self {
            feed: Feed::new(STOCKS_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            live: Feed::new(STOCKS_LIVE_KEY, LIVE_MAX_AGE_SECS, LIVE_REFETCH_AFTER_SECS),
            charts: Mutex::new(HashMap::new()),
            client: HttpClient::new(),
        }
    }
}

impl StocksCache {
    /// One cached chart per share and range, made the first time it's asked
    /// for. The session's chart moves by the minute while NEPSE trades; the
    /// daily ranges gain one point a day.
    fn chart_feed(&self, symbol: &str, range: &str) -> Arc<Feed<StockChart>> {
        let (max_age, refetch) = if range == "1d" {
            (30 * 60, 60)
        } else {
            (24 * 60 * 60, 3 * 60 * 60)
        };
        self.charts
            .lock()
            .expect("stock chart feeds mutex poisoned")
            .entry((symbol.to_owned(), range.to_owned()))
            .or_insert_with(|| {
                Arc::new(Feed::keyed(
                    Cow::Owned(format!("{STOCKS_KEY}.chart.{symbol}.{range}")),
                    max_age,
                    refetch,
                ))
            })
            .clone()
    }
}

/// One share's price over `range` (`1d`, `1w`, `1m`, `3m`, `1y`, `5y`).
#[tauri::command]
pub async fn get_stock_chart(
    app: AppHandle<Wry>,
    symbol: String,
    range: String,
) -> LoadState<StockChart> {
    let symbol = symbol.trim().to_ascii_uppercase();
    if !sharehub_chart::valid_symbol(&symbol)
        || !sharehub_chart::CHART_RANGES.contains(&range.as_str())
    {
        return LoadState::Failed(format!("unsupported chart: {symbol} {range}"));
    }
    let cache = app.state::<StocksCache>();
    let feed = cache.chart_feed(&symbol, &range);
    let client = &cache.client;
    let now = Utc::now();
    feed.get(&app, now, false, || {
        sharehub_chart::fetch(client, &symbol, &range, now)
    })
    .await
}

/// Whether the live board could say anything the day table does not: the
/// exchange is open, or the table on hand is from an earlier trading day.
fn wants_live(snapshot: &StockMarketSnapshot, now: chrono::DateTime<Utc>) -> bool {
    if snapshot
        .market_status
        .as_ref()
        .is_some_and(|status| status.is_open)
    {
        return true;
    }
    let today = now.with_timezone(&nepal_time::offset()).date_naive();
    // ShareSansar dates its table as a bare day, stored at UTC midnight.
    snapshot
        .freshness
        .source_timestamp
        .is_none_or(|published| published.date_naive() < today)
}

#[tauri::command]
pub async fn get_stocks(
    app: AppHandle<Wry>,
    refresh: Option<bool>,
) -> LoadState<StockMarketSnapshot> {
    let cache = app.state::<StocksCache>();
    let client = &cache.client;
    let now = Utc::now();
    let force = refresh.unwrap_or(false);
    let state = cache
        .feed
        .get(&app, now, force, || sharesansar::fetch(client, now))
        .await;

    let Some(snapshot) = state.value() else {
        return state;
    };
    if !wants_live(snapshot, now) {
        return state;
    }
    // A failed live fetch changes nothing: the day table is still shown.
    let live = cache
        .live
        .get(&app, now, force, || sharehub_live::fetch(client))
        .await;
    let Some(live) = live.value() else {
        return state;
    };
    state.map(|mut snapshot| {
        sharehub_live::overlay(&mut snapshot, live);
        snapshot
    })
}
