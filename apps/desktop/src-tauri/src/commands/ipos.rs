//! CDSC's current IPO issues, shown alongside the stock market view.

use chrono::Utc;
use sajilo_api::ipos::IpoSnapshot;
use sajilo_api::load_state::LoadState;
use sajilo_providers::{HttpClient, cdsc};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::IPOS_KEY;

/// Issue windows move by the day, so half an hour between pulls is plenty;
/// past four hours the stored copy is shown, labelled stale.
const MAX_AGE_SECS: i64 = 4 * 60 * 60;
const REFETCH_AFTER_SECS: i64 = 30 * 60;

pub struct IposCache {
    feed: Feed<IpoSnapshot>,
    client: HttpClient,
}

impl Default for IposCache {
    fn default() -> Self {
        Self {
            feed: Feed::new(IPOS_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            client: HttpClient::new(),
        }
    }
}

#[tauri::command]
pub async fn get_ipos(app: AppHandle<Wry>, refresh: Option<bool>) -> LoadState<IpoSnapshot> {
    let cache = app.state::<IposCache>();
    let client = &cache.client;
    let now = Utc::now();
    cache
        .feed
        .get(&app, now, refresh.unwrap_or(false), || {
            cdsc::fetch(client, now)
        })
        .await
}
