//! The caching every remote module shares.
//!
//! Each feed keeps its last good value in memory and on disk, and classifies it
//! by age on the way out. That is the whole of PRD §6 in one place: a module
//! shows fresh data, labelled stale data, or an explicit failure — and a failed
//! refresh never discards what is already on screen.
//!
//! ponytail: this is the client-side half of what `apps/server` does. When the
//! server is deployed and `client.rs` lands, the `fetch` closures change and
//! everything here stays.

use std::future::Future;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::db;
use chrono::{DateTime, Utc};
use sajilo_api::load_state::LoadState;
use serde::Serialize;
use serde::de::DeserializeOwned;
use tauri::{AppHandle, Wry};

/// A dead upstream is retried once before the value is given up on. Sources
/// behind Cloudflare answer 521 while their origin restarts, which is usually
/// over in seconds — showing an error for that is premature.
const RETRY_AFTER: std::time::Duration = std::time::Duration::from_millis(700);

/// One cached value and when it was fetched.
#[derive(Serialize, serde::Deserialize)]
struct Cached<T> {
    value: T,
    fetched_at: DateTime<Utc>,
}

/// One remote module's cache.
pub struct Feed<T> {
    /// Where this feed lives in the store, so each survives a restart on its
    /// own rather than as one all-or-nothing blob.
    key: &'static str,
    /// How long a value counts as fresh. Past this it is still shown, labelled.
    max_age_secs: i64,
    /// How long before another fetch is attempted at all. Opening the popover
    /// five times in a minute must not scrape five times.
    refetch_after_secs: i64,
    slot: Mutex<Option<Cached<T>>>,
    hydrated: AtomicBool,
}

impl<T: Clone + Serialize + DeserializeOwned> Feed<T> {
    pub const fn new(key: &'static str, max_age_secs: i64, refetch_after_secs: i64) -> Self {
        Self {
            key,
            max_age_secs,
            refetch_after_secs,
            slot: Mutex::new(None),
            hydrated: AtomicBool::new(false),
        }
    }

    /// The current value: the cache while it is young, otherwise a refetch that
    /// falls back to the cache if it fails.
    pub async fn get<F, Fut>(
        &self,
        app: &AppHandle<Wry>,
        now: DateTime<Utc>,
        force: bool,
        fetch: F,
    ) -> LoadState<T>
    where
        F: FnOnce() -> Fut + Clone,
        Fut: Future<Output = sajilo_providers::Result<T>>,
    {
        self.hydrate(app);

        let cached = {
            let guard = self.slot.lock().expect("feed cache mutex poisoned");
            guard
                .as_ref()
                .map(|entry| (entry.value.clone(), entry.fetched_at))
        };

        if !force
            && let Some((value, fetched_at)) = &cached
            && (now - *fetched_at).num_seconds() < self.refetch_after_secs
        {
            return LoadState::from_cache(value.clone(), *fetched_at, self.max_age_secs, now);
        }

        match retrying(fetch).await {
            Ok(value) => {
                self.store(app, &value, now);
                LoadState::Fresh(value)
            }
            // A dead upstream must not discard a good value we already hold.
            Err(error) => match cached {
                Some((value, fetched_at)) => {
                    LoadState::from_cache(value, fetched_at, self.max_age_secs, now)
                }
                None => LoadState::Failed(error.to_string()),
            },
        }
    }

    /// Fills the slot from the store on first use. A payload written by a newer
    /// build must not take the screen down, so an unreadable one reads as
    /// "nothing cached" and is replaced by the next successful fetch.
    fn hydrate(&self, app: &AppHandle<Wry>) {
        if self.hydrated.swap(true, Ordering::SeqCst) {
            return;
        }
        let Ok(Some(raw)) = db::get_json(app, self.key) else {
            return;
        };
        if let Ok(cached) = serde_json::from_value::<Cached<T>>(raw) {
            *self.slot.lock().expect("feed cache mutex poisoned") = Some(cached);
        }
    }

    /// Keeps the value in memory and on disk. Persistence failing is not worth
    /// surfacing — the in-memory copy still answers this session.
    fn store(&self, app: &AppHandle<Wry>, value: &T, now: DateTime<Utc>) {
        *self.slot.lock().expect("feed cache mutex poisoned") = Some(Cached {
            value: value.clone(),
            fetched_at: now,
        });
        if let Ok(raw) = serde_json::to_value(Cached {
            value,
            fetched_at: now,
        }) {
            let _ = db::set_json(app, self.key, &raw);
        }
    }
}

/// Runs a fetch, retrying once for the failures that are usually momentary —
/// a 429, a 5xx, or a dropped connection.
async fn retrying<T, F, Fut>(fetch: F) -> sajilo_providers::Result<T>
where
    F: FnOnce() -> Fut + Clone,
    Fut: Future<Output = sajilo_providers::Result<T>>,
{
    match fetch.clone()().await {
        Err(error) if error.is_retryable() => {
            tokio::time::sleep(RETRY_AFTER).await;
            fetch().await
        }
        result => result,
    }
}
