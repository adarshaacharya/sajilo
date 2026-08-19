//! NRB official exchange rates.

use chrono::Utc;
use sajilo_api::forex::ForexSnapshot;
use sajilo_api::load_state::LoadState;
use sajilo_core::nepal_time;
use sajilo_providers::{HttpClient, nrb};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::FOREX_KEY;

const MAX_AGE_SECS: i64 = 60 * 60;
const REFETCH_AFTER_SECS: i64 = 15 * 60;

pub struct ForexCache {
    feed: Feed<ForexSnapshot>,
    client: HttpClient,
}

impl Default for ForexCache {
    fn default() -> Self {
        Self {
            feed: Feed::new(FOREX_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
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
