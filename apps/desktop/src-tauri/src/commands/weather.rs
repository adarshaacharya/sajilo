//! Open-Meteo forecast and air quality for any place in `sajilo_core::places`.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use chrono::Utc;
use sajilo_api::load_state::LoadState;
use sajilo_api::weather::WeatherSnapshot;
use sajilo_core::places::{self, Place};
use sajilo_providers::{HttpClient, open_meteo};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::{weather_cache_key, weather_location};

const MAX_AGE_SECS: i64 = 30 * 60;
const REFETCH_AFTER_SECS: i64 = 10 * 60;

/// One feed per place, made the first time that place is asked for. A user
/// pins a handful at most, so the map stays small.
#[derive(Default)]
pub struct WeatherCache {
    feeds: Mutex<HashMap<&'static str, Arc<Feed<WeatherSnapshot>>>>,
    client: HttpClient,
}

impl WeatherCache {
    fn feed(&self, place: &'static Place) -> Arc<Feed<WeatherSnapshot>> {
        self.feeds
            .lock()
            .expect("weather feeds mutex poisoned")
            .entry(place.id.as_str())
            .or_insert_with(|| {
                Arc::new(Feed::keyed(
                    weather_cache_key(&place.id).into(),
                    MAX_AGE_SECS,
                    REFETCH_AFTER_SECS,
                ))
            })
            .clone()
    }
}

/// Weather for `location` (a place id), or for the home place when it is
/// absent or not a place this build knows.
#[tauri::command]
pub async fn get_weather(
    app: AppHandle<Wry>,
    refresh: Option<bool>,
    location: Option<String>,
) -> LoadState<WeatherSnapshot> {
    let cache = app.state::<WeatherCache>();
    let client = &cache.client;
    let now = Utc::now();
    let place = location
        .as_deref()
        .and_then(places::find)
        .unwrap_or_else(|| weather_location(&app));

    cache
        .feed(place)
        .get(&app, now, refresh.unwrap_or(false), || {
            open_meteo::fetch(client, place, now)
        })
        .await
}

/// Every place the weather can be shown for, for the picker. Bundled, so this
/// never waits on the network.
#[tauri::command]
pub fn list_places() -> &'static [Place] {
    places::all()
}
