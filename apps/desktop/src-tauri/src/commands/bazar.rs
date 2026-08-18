//! Gold and silver, fuel, and the Kalimati vegetable board.
//!
//! ponytail: the desktop fetches the three upstreams itself rather than going
//! through `api.sajilo.app`. The server exists and M7 plans to route through
//! it, but it is not deployed yet, and a screen that shows nothing until it is
//! deployed is worse than one that scrapes directly. Swapping this module for
//! an HTTP client later leaves the command signature and the UI untouched.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use chrono::{DateTime, Utc};
use sajilo_api::bazar::{FuelPriceSnapshot, MetalRateSnapshot, VegetableMarketSnapshot};
use sajilo_api::load_state::LoadState;
use sajilo_providers::{HttpClient, fenegosida, hamropatro_metals, kalimati, nepalipatro, noc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_store::StoreExt;

use crate::prefs::{BAZAR_KEY, STORE_FILE};

/// The three feeds revise daily at most, so an hour-old number is still the
/// current number. Past that it is shown, but labelled stale.
const MAX_AGE_SECS: i64 = 60 * 60;

/// How long a cached payload is reused before another fetch is attempted at
/// all. Opening the popover five times in a minute must not scrape five times.
const REFETCH_AFTER_SECS: i64 = 15 * 60;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bazar {
    pub metals: LoadState<MetalRateSnapshot>,
    pub fuel: LoadState<FuelPriceSnapshot>,
    pub vegetables: LoadState<VegetableMarketSnapshot>,
}

/// A dead upstream is retried once before the value is given up on. FENEGOSIDA
/// sits behind Cloudflare and answers 521 while its origin restarts, which is
/// usually over in seconds — showing an error for that is premature.
const RETRY_AFTER: Duration = Duration::from_millis(700);

/// One cached feed and when it was fetched. A failed refresh keeps the previous
/// value and its timestamp — it never blanks the feed.
#[derive(Serialize, Deserialize)]
struct Cached<T> {
    value: T,
    fetched_at: DateTime<Utc>,
}

/// What survives a restart. Without this a cold start against a dead upstream
/// has nothing to show, which is the one case the freshness rules exist to
/// avoid.
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Persisted {
    metals: Option<Cached<MetalRateSnapshot>>,
    fuel: Option<Cached<FuelPriceSnapshot>>,
    vegetables: Option<Cached<VegetableMarketSnapshot>>,
}

#[derive(Default)]
pub struct BazarCache {
    metals: Mutex<Option<Cached<MetalRateSnapshot>>>,
    fuel: Mutex<Option<Cached<FuelPriceSnapshot>>>,
    vegetables: Mutex<Option<Cached<VegetableMarketSnapshot>>>,
    client: Mutex<Option<HttpClient>>,
    hydrated: AtomicBool,
}

impl BazarCache {
    fn client(&self) -> HttpClient {
        let mut slot = self.client.lock().expect("bazar client mutex poisoned");
        slot.get_or_insert_with(HttpClient::new).clone()
    }

    /// Fills empty slots from the store on first use. A store written by a
    /// newer build must not take the screen down, so an unreadable payload
    /// reads as "nothing cached" and is replaced by the next successful fetch.
    fn hydrate(&self, app: &AppHandle<Wry>) {
        if self.hydrated.swap(true, Ordering::SeqCst) {
            return;
        }
        let Ok(store) = app.store(STORE_FILE) else {
            return;
        };
        let Some(raw) = store.get(BAZAR_KEY) else {
            return;
        };
        let disk: Persisted = serde_json::from_value(raw).unwrap_or_default();
        *self.metals.lock().expect("bazar cache mutex poisoned") = disk.metals;
        *self.fuel.lock().expect("bazar cache mutex poisoned") = disk.fuel;
        *self.vegetables.lock().expect("bazar cache mutex poisoned") = disk.vegetables;
    }

    /// Writes every cached feed back. Persistence failing is not worth
    /// surfacing — the in-memory copy still answers this session.
    fn persist(&self, app: &AppHandle<Wry>) {
        let Ok(store) = app.store(STORE_FILE) else {
            return;
        };
        let snapshot = Persisted {
            metals: self.metals.lock().expect("poisoned").take(),
            fuel: self.fuel.lock().expect("poisoned").take(),
            vegetables: self.vegetables.lock().expect("poisoned").take(),
        };
        if let Ok(value) = serde_json::to_value(&snapshot) {
            store.set(BAZAR_KEY, value);
            let _ = store.save();
        }
        // Put them back: `take` was only to avoid cloning three snapshots.
        *self.metals.lock().expect("poisoned") = snapshot.metals;
        *self.fuel.lock().expect("poisoned") = snapshot.fuel;
        *self.vegetables.lock().expect("poisoned") = snapshot.vegetables;
    }
}

/// The Federation first, then two independent republishers of its figures.
///
/// FENEGOSIDA sets the rate, so it stays primary. It also sits behind
/// Cloudflare and answers 521 whenever its origin is down, which is what the
/// rest of this chain is for:
///
/// 1. FENEGOSIDA — every metal and unit, plus the gold sparkline.
/// 2. Nepali Patro — the same Federation figures as dated JSON, so both units
///    and the sparkline survive; a different operator on different hosting.
/// 3. Hamro Patro — an HTML scrape, hallmark gold and silver per tola only.
///    Last because it carries the least, not because it is least reliable.
///
/// Every failure is reported as the Federation's. Naming a fallback the user
/// never chose would only puzzle them.
async fn metals_with_fallback(
    client: &HttpClient,
    now: DateTime<Utc>,
) -> sajilo_providers::Result<MetalRateSnapshot> {
    let primary = match fenegosida::fetch(client, now).await {
        Ok(snapshot) => return Ok(snapshot),
        Err(error) => error,
    };
    if let Ok(snapshot) = nepalipatro::fetch(client, now).await {
        return Ok(snapshot);
    }
    hamropatro_metals::fetch(client, now)
        .await
        .map_err(|_| primary)
}

/// Runs a fetch, retrying once for the failures that are usually momentary —
/// a 429, a 5xx, or a dropped connection.
async fn fetch_once_retrying<T, F, Fut>(fetch: F) -> sajilo_providers::Result<T>
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

/// Reads one feed: serve the cache while it is young, otherwise refetch and
/// fall back to whatever was cached if the fetch fails.
async fn feed<T, F, Fut>(
    slot: &Mutex<Option<Cached<T>>>,
    now: DateTime<Utc>,
    force: bool,
    fetch: F,
) -> LoadState<T>
where
    T: Clone,
    F: FnOnce() -> Fut + Clone,
    Fut: Future<Output = sajilo_providers::Result<T>>,
{
    let cached = {
        let guard = slot.lock().expect("bazar cache mutex poisoned");
        guard
            .as_ref()
            .map(|entry| (entry.value.clone(), entry.fetched_at))
    };

    if !force
        && let Some((value, fetched_at)) = &cached
        && (now - *fetched_at).num_seconds() < REFETCH_AFTER_SECS
    {
        return LoadState::from_cache(value.clone(), *fetched_at, MAX_AGE_SECS, now);
    }

    match fetch_once_retrying(fetch).await {
        Ok(value) => {
            *slot.lock().expect("bazar cache mutex poisoned") = Some(Cached {
                value: value.clone(),
                fetched_at: now,
            });
            LoadState::Fresh(value)
        }
        // A dead upstream must not discard a good number we already hold.
        Err(error) => match cached {
            Some((value, fetched_at)) => {
                LoadState::from_cache(value, fetched_at, MAX_AGE_SECS, now)
            }
            None => LoadState::Failed(error.to_string()),
        },
    }
}

#[tauri::command]
pub async fn get_bazar(app: AppHandle<Wry>, refresh: Option<bool>) -> Bazar {
    let cache = app.state::<BazarCache>();
    cache.hydrate(&app);
    let client = cache.client();
    let now = Utc::now();
    let force = refresh.unwrap_or(false);

    // One round trip's worth of wall clock for three feeds, and one slow source
    // does not hold up the other two's cached values.
    let (metals, fuel, vegetables) = tokio::join!(
        feed(&cache.metals, now, force, || metals_with_fallback(
            &client, now
        )),
        feed(&cache.fuel, now, force, || noc::fetch(&client, now)),
        feed(&cache.vegetables, now, force, || kalimati::fetch(
            &client, now
        )),
    );

    cache.persist(&app);

    Bazar {
        metals,
        fuel,
        vegetables,
    }
}
