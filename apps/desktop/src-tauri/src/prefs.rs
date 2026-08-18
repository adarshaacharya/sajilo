//! Reading user preferences from the store.
//!
//! The tray is built before any webview exists, so it cannot ask the frontend
//! what the user picked — it reads the same store the Settings screen writes.

use sajilo_api::weather::WeatherLocation;
use sajilo_core::numerals::NumeralStyle;
use tauri::{AppHandle, Wry};
use tauri_plugin_store::StoreExt;

use crate::tray::title::MenuBarFormat;

pub const STORE_FILE: &str = "sajilo.json";
pub const MENU_BAR_FORMAT: &str = "menuBarFormat";
pub const NUMERAL_STYLE: &str = "numeralStyle";
/// The same key the Swift app used, so an imported backup lands where the app
/// already looks.
pub const PLANS_KEY: &str = "dayPlans.v1";

/// Remote-module caches live in their own file, never in `sajilo.json`.
///
/// The frontend opens the settings store with `autoSave`, which writes its
/// whole in-memory map back — so a cache key written from Rust between a JS
/// read and a JS write would be dropped. Separate files, separate owners.
pub const CACHE_FILE: &str = "cache.json";

// Last good payload per remote module. Cached on disk so a cold start against
// a dead upstream still has yesterday's value to label as stale, and kept one
// key per feed so a single unreadable entry cannot take the others down.
pub const BAZAR_METALS_KEY: &str = "bazar.metals.v1";
pub const BAZAR_FUEL_KEY: &str = "bazar.fuel.v1";
pub const BAZAR_VEGETABLES_KEY: &str = "bazar.vegetables.v1";
pub const RASHIFAL_KEY: &str = "rashifal.v1";
pub const RADIO_KEY: &str = "radio.v1";
pub const WEATHER_KATHMANDU_KEY: &str = "weather.kathmandu.v1";
pub const WEATHER_POKHARA_KEY: &str = "weather.pokhara.v1";
pub const WEATHER_LALITPUR_KEY: &str = "weather.lalitpur.v1";
pub const FOREX_KEY: &str = "forex.v1";
pub const NEWS_KEY: &str = "news.v1";

pub const WEATHER_LOCATION: &str = "weatherLocation";
pub const WEATHER_ENABLED: &str = "weatherEnabled";
pub const FOREX_ENABLED: &str = "forexEnabled";
pub const NEWS_ENABLED: &str = "newsEnabled";
pub const BAZAR_ENABLED: &str = "bazarEnabled";
pub const RASHIFAL_ENABLED: &str = "rashifalEnabled";
pub const RADIO_ENABLED: &str = "radioEnabled";
pub const FOREX_FAVOURITES: &str = "forexFavourites";

/// Falls back to the defaults rather than failing: an unreadable preference
/// should cost the user their choice for one launch, not the tray label.
pub fn tray_preferences(app: &AppHandle<Wry>) -> (MenuBarFormat, NumeralStyle) {
    let Ok(store) = app.store(STORE_FILE) else {
        return (MenuBarFormat::default(), NumeralStyle::default());
    };
    fn read<T: serde::de::DeserializeOwned + Default>(
        store: &tauri_plugin_store::Store<Wry>,
        key: &str,
    ) -> T {
        store
            .get(key)
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default()
    }
    (read(&store, MENU_BAR_FORMAT), read(&store, NUMERAL_STYLE))
}

/// Which city the weather module fetches for. Matches the Swift backup key.
pub fn weather_location(app: &AppHandle<Wry>) -> WeatherLocation {
    let Ok(store) = app.store(STORE_FILE) else {
        return WeatherLocation::default();
    };
    store
        .get(WEATHER_LOCATION)
        .and_then(|value| value.as_str().map(str::to_owned))
        .and_then(|key| WeatherLocation::from_key(&key))
        .unwrap_or_default()
}
