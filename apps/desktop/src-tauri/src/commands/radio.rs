//! The station directory. Playback itself is an `<audio>` element in the
//! webview — the stream goes straight from the station to the player, and
//! never through Rust.

use chrono::Utc;
use sajilo_api::load_state::LoadState;
use sajilo_api::radio::{RadioDirectory, RadioPack};
use sajilo_core::config::Pack;
use sajilo_providers::{HttpClient, ratopati};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::RADIO_KEY;

/// A station list changes a few times a year. A day fresh, and a week-old list
/// still plays every station that has not moved.
const MAX_AGE_SECS: i64 = 24 * 60 * 60;
const REFETCH_AFTER_SECS: i64 = 6 * 60 * 60;

pub struct RadioCache {
    feed: Feed<RadioDirectory>,
    client: HttpClient,
}

impl Default for RadioCache {
    fn default() -> Self {
        Self {
            feed: Feed::new(RADIO_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            client: HttpClient::new(),
        }
    }
}

#[tauri::command]
pub async fn get_stations(app: AppHandle<Wry>, refresh: Option<bool>) -> LoadState<RadioDirectory> {
    let cache = app.state::<RadioCache>();
    let client = &cache.client;
    let now = Utc::now();

    cache
        .feed
        .get(&app, now, refresh.unwrap_or(false), || {
            ratopati::fetch_directory(client, now)
        })
        .await
        // Applied on the way out, not stored, so a pack change shows at once
        // and the cached directory stays Ratopati's own.
        .map(|directory| RadioPack::active().apply(directory))
}

/// The playable URL for one station, read from its own page.
///
/// Resolved on demand rather than by crawling every station up front — the
/// directory lists around 270 of them, and a listener plays one.
#[tauri::command]
pub async fn station_stream(app: AppHandle<Wry>, slug: String) -> Result<String, String> {
    if let Some(url) = RadioPack::active().stream_for(&slug) {
        return Ok(url);
    }
    let client = app.state::<RadioCache>().client.clone();
    ratopati::fetch_stream_url(&client, &slug)
        .await
        .map_err(|error| error.to_string())
}
