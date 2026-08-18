//! One task per feed, each on its own cadence.
//!
//! The scheduler is the *only* thing that talks upstream. Nothing on the
//! request path fetches, so upstream traffic is a function of the cadence table
//! and nothing else — one client or ten thousand cost the sources the same.

pub mod backoff;

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use sajilo_api::bundle::ModuleKey;
use sajilo_api::weather::WeatherLocation;
use sajilo_providers::HttpClient;
use serde_json::Value;

use crate::cache::Cache;
use crate::config::Config;

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// The seam between the scheduler and the outside world.
///
/// Exists so a test can prove the request path never fetches: swap in a
/// counting implementation and assert the count does not move while requests
/// are served.
pub trait FeedSource: Send + Sync + 'static {
    fn fetch(&self, module: ModuleKey, now: DateTime<Utc>) -> BoxFuture<'_, Result<Value, String>>;
}

/// The real thing: every provider from `sajilo-providers`.
pub struct LiveFeeds {
    client: HttpClient,
    /// Weather is fetched per city, and only for cities actually in use — the
    /// server has no reason to warm Pokhara if nobody is asking for it.
    weather_location: WeatherLocation,
}

impl LiveFeeds {
    pub fn new() -> Self {
        Self {
            client: HttpClient::new(),
            weather_location: WeatherLocation::default(),
        }
    }
}

impl Default for LiveFeeds {
    fn default() -> Self {
        Self::new()
    }
}

/// Serialising here rather than in the cache keeps `Cache` free of any
/// knowledge of what a module's payload actually is.
fn encode<T: serde::Serialize>(value: T) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|error| error.to_string())
}

impl FeedSource for LiveFeeds {
    fn fetch(&self, module: ModuleKey, now: DateTime<Utc>) -> BoxFuture<'_, Result<Value, String>> {
        Box::pin(async move {
            let client = &self.client;
            match module {
                ModuleKey::Weather => encode(
                    sajilo_providers::open_meteo::fetch(client, self.weather_location, now)
                        .await
                        .map_err(|e| e.to_string())?,
                ),
                ModuleKey::Forex => encode(
                    sajilo_providers::nrb::fetch(client, now.date_naive(), now)
                        .await
                        .map_err(|e| e.to_string())?,
                ),
                ModuleKey::News => encode(
                    sajilo_providers::rss::fetch(client, now, sajilo_providers::rss::DEFAULT_LIMIT)
                        .await
                        .map_err(|e| e.to_string())?,
                ),
                ModuleKey::Metals => encode(
                    sajilo_providers::fenegosida::fetch(client, now)
                        .await
                        .map_err(|e| e.to_string())?,
                ),
                ModuleKey::Fuel => encode(
                    sajilo_providers::noc::fetch(client, now)
                        .await
                        .map_err(|e| e.to_string())?,
                ),
                ModuleKey::Vegetables => encode(
                    sajilo_providers::kalimati::fetch(client, now)
                        .await
                        .map_err(|e| e.to_string())?,
                ),
                ModuleKey::Rashifal => encode(
                    sajilo_providers::hamropatro::fetch(client, now)
                        .await
                        .map_err(|e| e.to_string())?,
                ),
                ModuleKey::Radio => encode(
                    sajilo_providers::ratopati::fetch_directory(client, now)
                        .await
                        .map_err(|e| e.to_string())?,
                ),
            }
        })
    }
}

/// Fetches once and records the outcome. Returns how long to wait before the
/// next attempt: the feed's interval on success, a backoff on failure.
pub async fn refresh_once(
    module: ModuleKey,
    module_index: usize,
    feeds: &dyn FeedSource,
    cache: &Cache,
    config: &Config,
) -> std::time::Duration {
    let now = Utc::now();
    match feeds.fetch(module, now).await {
        Ok(payload) => {
            cache.store(module, &payload, now);
            tracing::info!(module = module.key(), "refreshed");
            backoff::jitter(config.interval(module), module_index)
        }
        Err(error) => {
            // The previous value stays exactly as it was. It will be served,
            // labelled stale, until something better arrives.
            cache.record_failure(module, &error);
            let failures = cache.consecutive_failures(module);
            tracing::warn!(module = module.key(), failures, %error, "refresh failed");
            backoff::delay(failures).min(config.interval(module))
        }
    }
}

/// Spawns one task per module. Each owns its own cadence and never blocks
/// another — a slow news merge does not delay the forex refresh.
pub fn spawn_all(feeds: Arc<dyn FeedSource>, cache: Arc<Cache>, config: Arc<Config>) {
    for (index, module) in ModuleKey::ALL.into_iter().enumerate() {
        let (feeds, cache, config) = (feeds.clone(), cache.clone(), config.clone());
        tokio::spawn(async move {
            loop {
                let wait = refresh_once(module, index, feeds.as_ref(), &cache, &config).await;
                tokio::time::sleep(wait).await;
            }
        });
    }
}
