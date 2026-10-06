//! NRB official exchange rates.

use chrono::Utc;
use sajilo_api::forex::{ForexHistory, ForexSnapshot};
use sajilo_api::load_state::LoadState;
use sajilo_core::nepal_time;
use sajilo_providers::{HttpClient, nrb};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::{FOREX_HISTORY_KEY, FOREX_KEY};

const MAX_AGE_SECS: i64 = 60 * 60;
const REFETCH_AFTER_SECS: i64 = 15 * 60;
/// NRB publishes once a day; a year of history is fresh for a day and worth
/// re-asking for every few hours at most.
const HISTORY_MAX_AGE_SECS: i64 = 24 * 60 * 60;
const HISTORY_REFETCH_AFTER_SECS: i64 = 6 * 60 * 60;

pub struct ForexCache {
    feed: Feed<ForexSnapshot>,
    history: Feed<ForexHistory>,
    client: HttpClient,
}

impl Default for ForexCache {
    fn default() -> Self {
        Self {
            feed: Feed::new(FOREX_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            history: Feed::new(
                FOREX_HISTORY_KEY,
                HISTORY_MAX_AGE_SECS,
                HISTORY_REFETCH_AFTER_SECS,
            ),
            client: HttpClient::new(),
        }
    }
}

#[tauri::command]
pub async fn get_forex(app: AppHandle<Wry>, refresh: Option<bool>) -> LoadState<ForexSnapshot> {
    let cache = app.state::<ForexCache>();
    let client = &cache.client;
    let now = Utc::now();
    let today = nepal_time::today();

    cache
        .feed
        .get(&app, now, refresh.unwrap_or(false), || {
            nrb::fetch(client, today, now)
        })
        .await
}

/// A year of daily rates for every currency, for the chart. Fetched only
/// when a chart is opened, never by the background refresh.
#[tauri::command]
pub async fn get_forex_history(
    app: AppHandle<Wry>,
    refresh: Option<bool>,
) -> LoadState<ForexHistory> {
    let cache = app.state::<ForexCache>();
    let client = &cache.client;
    let now = Utc::now();
    let today = nepal_time::today();

    cache
        .history
        .get(&app, now, refresh.unwrap_or(false), || {
            nrb::fetch_history(client, today, now)
        })
        .await
}
