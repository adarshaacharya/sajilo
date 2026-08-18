//! NEPSE market snapshot from ShareSansar.

use chrono::Utc;
use sajilo_api::load_state::LoadState;
use sajilo_api::stocks::StockMarketSnapshot;
use sajilo_providers::{HttpClient, sharesansar};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::STOCKS_KEY;

const MAX_AGE_SECS: i64 = 15 * 60;
const REFETCH_AFTER_SECS: i64 = 5 * 60;

pub struct StocksCache {
    feed: Feed<StockMarketSnapshot>,
    client: HttpClient,
}

impl Default for StocksCache {
    fn default() -> Self {
        Self {
            feed: Feed::new(STOCKS_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            client: HttpClient::new(),
        }
    }
}

#[tauri::command]
pub async fn get_stocks(
    app: AppHandle<Wry>,
    refresh: Option<bool>,
) -> LoadState<StockMarketSnapshot> {
    let cache = app.state::<StocksCache>();
    let client = &cache.client;
    let now = Utc::now();
    cache
        .feed
        .get(&app, now, refresh.unwrap_or(false), || sharesansar::fetch(client, now))
        .await
}
