//! Open-Meteo forecast and air quality for the selected city.

use chrono::Utc;
use sajilo_api::load_state::LoadState;
use sajilo_api::weather::{WeatherLocation, WeatherSnapshot};
use sajilo_providers::{HttpClient, open_meteo};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::{
    WEATHER_KATHMANDU_KEY, WEATHER_LALITPUR_KEY, WEATHER_POKHARA_KEY, weather_location,
};

const MAX_AGE_SECS: i64 = 30 * 60;
const REFETCH_AFTER_SECS: i64 = 10 * 60;

pub struct WeatherCache {
    kathmandu: Feed<WeatherSnapshot>,
    pokhara: Feed<WeatherSnapshot>,
    lalitpur: Feed<WeatherSnapshot>,
    client: HttpClient,
}

impl Default for WeatherCache {
    fn default() -> Self {
        Self {
            kathmandu: Feed::new(WEATHER_KATHMANDU_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            pokhara: Feed::new(WEATHER_POKHARA_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            lalitpur: Feed::new(WEATHER_LALITPUR_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            client: HttpClient::new(),
        }
    }
}

impl WeatherCache {
    fn feed(&self, location: WeatherLocation) -> &Feed<WeatherSnapshot> {
        match location {
            WeatherLocation::Kathmandu => &self.kathmandu,
            WeatherLocation::Pokhara => &self.pokhara,
            WeatherLocation::Lalitpur => &self.lalitpur,
        }
    }
}

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
        .and_then(WeatherLocation::from_key)
        .unwrap_or_else(|| weather_location(&app));

    cache
        .feed(place)
        .get(&app, now, refresh.unwrap_or(false), || open_meteo::fetch(client, place, now))
        .await
}
