//! NEPSE's intraday line from ShareHub, drawn in the market view's index card.

use chrono::Utc;
use sajilo_api::load_state::LoadState;
use sajilo_api::stocks::IndexIntraday;
use sajilo_providers::{HttpClient, nepse_intraday};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::NEPSE_INTRADAY_KEY;

/// Matches the price snapshot it is drawn beside, so the line and the number
/// above it are never minutes apart.
const MAX_AGE_SECS: i64 = 15 * 60;
const REFETCH_AFTER_SECS: i64 = 5 * 60;

pub struct NepseIntradayCache {
    feed: Feed<IndexIntraday>,
    client: HttpClient,
}

impl Default for NepseIntradayCache {
    fn default() -> Self {
        Self {
            feed: Feed::new(NEPSE_INTRADAY_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            client: HttpClient::new(),
        }
    }
}

#[tauri::command]
pub async fn get_nepse_intraday(
    app: AppHandle<Wry>,
    refresh: Option<bool>,
) -> LoadState<IndexIntraday> {
    let cache = app.state::<NepseIntradayCache>();
    let client = &cache.client;
    let now = Utc::now();
    cache
        .feed
        .get(&app, now, refresh.unwrap_or(false), || {
            nepse_intraday::fetch(client, now)
        })
        .await
}
