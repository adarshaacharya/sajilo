//! Nine-source RSS headline merge.

use chrono::Utc;
use sajilo_api::load_state::LoadState;
use sajilo_api::news::NewsDigest;
use sajilo_providers::{HttpClient, rss};
use tauri::{AppHandle, Manager, Wry};

use crate::article_dates;
use crate::feed::Feed;
use crate::prefs::NEWS_KEY;

const MAX_AGE_SECS: i64 = 30 * 60;
const REFETCH_AFTER_SECS: i64 = 10 * 60;

pub struct NewsCache {
    feed: Feed<NewsDigest>,
    client: HttpClient,
}

impl Default for NewsCache {
    fn default() -> Self {
        Self {
            feed: Feed::new(NEWS_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            client: HttpClient::new(),
        }
    }
}

#[tauri::command]
pub async fn get_news(app: AppHandle<Wry>, refresh: Option<bool>) -> LoadState<NewsDigest> {
    let cache = app.state::<NewsCache>();
    let client = &cache.client;
    let now = Utc::now();
    let handle = app.clone();

    cache
        .feed
        .get(&app, now, refresh.unwrap_or(false), || {
            let handle = handle.clone();
            async move {
                let digest = rss::fetch(client, now, rss::DEFAULT_LIMIT).await?;
                Ok(article_dates::augment(&handle, client, digest).await)
            }
        })
        .await
}
