//! Reading user preferences from the store.
//!
//! The tray is built before any webview exists, so it cannot ask the frontend
//! what the user picked — it reads the same store the Settings screen writes.

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
