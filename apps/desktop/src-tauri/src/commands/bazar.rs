//! Gold and silver, fuel, and the Kalimati vegetable board.
//!
//! ponytail: the desktop fetches the upstreams itself rather than going through
//! `api.sajilo.app`. The server exists and M7 plans to route through it, but it
//! is not deployed yet, and a screen that shows nothing until it is deployed is
//! worse than one that scrapes directly. Swapping these closures for an HTTP
//! client later leaves the command signature and the UI untouched.

use chrono::{DateTime, Utc};
use sajilo_api::bazar::{FuelPriceSnapshot, MetalRateSnapshot, VegetableMarketSnapshot};
use sajilo_api::load_state::LoadState;
use sajilo_providers::{HttpClient, fenegosida, hamropatro_metals, kalimati, nepalipatro, noc};
use serde::Serialize;
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::{BAZAR_FUEL_KEY, BAZAR_METALS_KEY, BAZAR_VEGETABLES_KEY};

/// Metals and produce move daily at most, so an hour-old number is still the
/// current number. NOC revises fuel on its own schedule, weeks apart.
const METALS_MAX_AGE_SECS: i64 = 60 * 60;
const VEGETABLES_MAX_AGE_SECS: i64 = 6 * 60 * 60;
const FUEL_MAX_AGE_SECS: i64 = 12 * 60 * 60;
const REFETCH_AFTER_SECS: i64 = 15 * 60;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bazar {
    pub metals: LoadState<MetalRateSnapshot>,
    pub fuel: LoadState<FuelPriceSnapshot>,
    pub vegetables: LoadState<VegetableMarketSnapshot>,
}

pub struct BazarCache {
    metals: Feed<MetalRateSnapshot>,
    fuel: Feed<FuelPriceSnapshot>,
    vegetables: Feed<VegetableMarketSnapshot>,
    client: HttpClient,
}

impl Default for BazarCache {
    fn default() -> Self {
        Self {
            metals: Feed::new(BAZAR_METALS_KEY, METALS_MAX_AGE_SECS, REFETCH_AFTER_SECS),
            fuel: Feed::new(BAZAR_FUEL_KEY, FUEL_MAX_AGE_SECS, REFETCH_AFTER_SECS),
            vegetables: Feed::new(
                BAZAR_VEGETABLES_KEY,
                VEGETABLES_MAX_AGE_SECS,
                REFETCH_AFTER_SECS,
            ),
            client: HttpClient::new(),
        }
    }
}

#[tauri::command]
pub async fn get_bazar(app: AppHandle<Wry>, refresh: Option<bool>) -> Bazar {
    let cache = app.state::<BazarCache>();
    let client = &cache.client;
    let now = Utc::now();
    let force = refresh.unwrap_or(false);

    // One round trip's worth of wall clock for three feeds, and one slow source
    // does not hold up the other two.
    let (metals, fuel, vegetables) = tokio::join!(
        cache
            .metals
            .get(&app, now, force, || metals_with_fallback(client, now)),
        cache.fuel.get(&app, now, force, || noc::fetch(client, now)),
        cache
            .vegetables
            .get(&app, now, force, || kalimati::fetch(client, now)),
    );

    Bazar {
        metals,
        fuel,
        vegetables,
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
