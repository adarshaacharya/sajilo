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
