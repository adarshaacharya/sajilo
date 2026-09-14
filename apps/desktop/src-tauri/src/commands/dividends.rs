//! Upcoming dividend book closures from ShareHub, shown on the stock market view.

use chrono::Utc;
use sajilo_api::dividends::DividendSnapshot;
use sajilo_api::load_state::LoadState;
use sajilo_providers::{HttpClient, dividends};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::DIVIDENDS_KEY;

/// Closures are announced days ahead and move by the date, so an hourly pull
/// is plenty; past half a day the stored copy is shown, labelled stale.
const MAX_AGE_SECS: i64 = 12 * 60 * 60;
const REFETCH_AFTER_SECS: i64 = 60 * 60;

pub struct DividendsCache {
    feed: Feed<DividendSnapshot>,
    client: HttpClient,
}

impl Default for DividendsCache {
    fn default() -> Self {
        Self {
            feed: Feed::new(DIVIDENDS_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            client: HttpClient::new(),
        }
    }
}

#[tauri::command]
pub async fn get_dividends(
    app: AppHandle<Wry>,
    refresh: Option<bool>,
) -> LoadState<DividendSnapshot> {
    let cache = app.state::<DividendsCache>();
    let client = &cache.client;
    let now = Utc::now();
    cache
        .feed
        .get(&app, now, refresh.unwrap_or(false), || {
            dividends::fetch(client, now)
        })
        .await
}
