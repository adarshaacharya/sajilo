//! The twelve daily rashifal readings.

use chrono::Utc;
use sajilo_api::load_state::LoadState;
use sajilo_api::rashifal::RashifalSnapshot;
use sajilo_providers::{HttpClient, hamropatro};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::RASHIFAL_KEY;

/// One reading per day, published each morning. Half a day keeps it labelled
/// fresh through the day it belongs to.
const MAX_AGE_SECS: i64 = 12 * 60 * 60;
const REFETCH_AFTER_SECS: i64 = 60 * 60;

pub struct RashifalCache {
    feed: Feed<RashifalSnapshot>,
    client: HttpClient,
}

impl Default for RashifalCache {
    fn default() -> Self {
        Self {
            feed: Feed::new(RASHIFAL_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            client: HttpClient::new(),
        }
    }
}

#[tauri::command]
pub async fn get_rashifal(
    app: AppHandle<Wry>,
    refresh: Option<bool>,
) -> LoadState<RashifalSnapshot> {
    let cache = app.state::<RashifalCache>();
    let client = &cache.client;
    let now = Utc::now();

    cache
        .feed
        .get(&app, now, refresh.unwrap_or(false), || {
            hamropatro::fetch(client, now)
        })
        .await
}
