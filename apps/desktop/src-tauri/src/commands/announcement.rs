//! The one editorial notice that can appear on Sajilo's Today screen.
//!
//! The public Worker is the only network hop. The client caches both an active
//! notice and the deliberate "nothing to show" response, so an expired notice
//! disappears cleanly and an offline launch never invents a new banner.

use chrono::Utc;
use sajilo_api::announcement::AnnouncementResponse;
use sajilo_api::load_state::LoadState;
use sajilo_providers::{HttpClient, ProviderError};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::ANNOUNCEMENT_KEY;

pub const ANNOUNCEMENT_ENDPOINT: &str =
    "https://sajilo-announcements.adarshx.workers.dev/v1/announcement";

const MAX_AGE_SECS: i64 = 2 * 60 * 60;
const REFETCH_AFTER_SECS: i64 = 30 * 60;
const SOURCE_NAME: &str = "Sajilo announcements";

pub struct AnnouncementCache {
    feed: Feed<AnnouncementResponse>,
    client: HttpClient,
}

impl Default for AnnouncementCache {
    fn default() -> Self {
        Self {
            feed: Feed::new(ANNOUNCEMENT_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            client: HttpClient::new(),
        }
    }
}

#[tauri::command]
pub async fn get_announcement(
    app: AppHandle<Wry>,
    refresh: Option<bool>,
) -> LoadState<AnnouncementResponse> {
    let cache = app.state::<AnnouncementCache>();
    let client = &cache.client;
    let now = Utc::now();

    cache
        .feed
        .get(&app, now, refresh.unwrap_or(false), || async move {
            let raw = client.get_text(SOURCE_NAME, ANNOUNCEMENT_ENDPOINT).await?;
            serde_json::from_str(&raw)
                .map_err(|error| ProviderError::parse(SOURCE_NAME, error.to_string()))
        })
        .await
}
