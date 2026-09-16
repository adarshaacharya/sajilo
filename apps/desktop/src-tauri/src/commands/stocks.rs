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
use sajilo_api::stocks::StockMarketSnapshot;
use sajilo_core::nepal_time;
use sajilo_providers::sharehub_live::{self, LiveMarket};
use sajilo_providers::{HttpClient, sharesansar};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::{STOCKS_KEY, STOCKS_LIVE_KEY};

const MAX_AGE_SECS: i64 = 15 * 60;
const REFETCH_AFTER_SECS: i64 = 5 * 60;
/// The board moves every minute in session; a minute is as often as the
/// screen asks, so a page kept open sees each refresh land.
const LIVE_MAX_AGE_SECS: i64 = 10 * 60;
const LIVE_REFETCH_AFTER_SECS: i64 = 60;

pub struct StocksCache {
    feed: Feed<StockMarketSnapshot>,
    live: Feed<LiveMarket>,
    client: HttpClient,
}

impl Default for StocksCache {
    fn default() -> Self {
        Self {
            feed: Feed::new(STOCKS_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            live: Feed::new(STOCKS_LIVE_KEY, LIVE_MAX_AGE_SECS, LIVE_REFETCH_AFTER_SECS),
            client: HttpClient::new(),
        }
    }
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
