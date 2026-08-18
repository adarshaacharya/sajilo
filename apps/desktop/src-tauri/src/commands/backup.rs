//! Export and import of the user's own data.
//!
//! The encoding rules live in `sajilo-core`; this reads and writes the store
//! around them. Format version 1 is a compatibility contract with the Swift app,
//! so a backup exported there imports here — which is what makes the migration
//! something a user can carry across rather than start over from.
//!
//! Every preference lives in its own flat store key rather than one nested
//! `"preferences"` blob — the tray, Settings screen, and notification scheduler
//! all read individual keys directly, so this module maps `Preferences` field
//! by field onto exactly those keys instead of owning a second copy of the state.

use sajilo_core::backup::{Preferences, SajiloBackup};
use sajilo_core::notify::NotificationOptions;
use sajilo_core::planner::DayPlan;
use tauri::{AppHandle, Wry};
use tauri_plugin_store::{Store, StoreExt};

use crate::prefs::{
    BAZAR_ENABLED, CUSTOM_MENU_BAR_SHOWS_FLAG, CUSTOM_MENU_BAR_SHOWS_YEAR, FOREX_ENABLED,
    FOREX_FAVOURITES, LANGUAGE, MENU_BAR_FORMAT, NEWS_ENABLED, NOTIFICATION_OPTIONS, NUMERAL_STYLE,
    PLANS_KEY, RADIO_ENABLED, RADIO_FAVOURITES, RASHIFAL_ENABLED, SELECTED_RASHI, SHOWS_DOCK_ICON,
    STOCK_WATCHLIST, STORE_FILE, VEGETABLE_FAVOURITES, WEATHER_ENABLED, WEATHER_LOCATION,
};

type Result<T> = std::result::Result<T, String>;

fn read<T: serde::de::DeserializeOwned>(store: &Store<Wry>, key: &str) -> Option<T> {
    store
        .get(key)
        .and_then(|value| serde_json::from_value(value).ok())
}

fn read_or<T: serde::de::DeserializeOwned>(store: &Store<Wry>, key: &str, default: T) -> T {
    read(store, key).unwrap_or(default)
}

fn set<T: serde::Serialize>(store: &Store<Wry>, key: &'static str, value: T) {
    if let Ok(json) = serde_json::to_value(value) {
        store.set(key, json);
    }
}

fn preferences_from_store(store: &Store<Wry>) -> Preferences {
    let defaults = Preferences::default();
    let notify: NotificationOptions =
        read_or(store, NOTIFICATION_OPTIONS, NotificationOptions::default());

    Preferences {
        menu_bar_format: read_or(store, MENU_BAR_FORMAT, defaults.menu_bar_format),
        custom_menu_bar_shows_flag: read_or(
            store,
            CUSTOM_MENU_BAR_SHOWS_FLAG,
            defaults.custom_menu_bar_shows_flag,
        ),
        custom_menu_bar_shows_year: read_or(
            store,
            CUSTOM_MENU_BAR_SHOWS_YEAR,
            defaults.custom_menu_bar_shows_year,
        ),
        app_language: read_or(store, LANGUAGE, defaults.app_language),
        numeral_style: read_or(store, NUMERAL_STYLE, defaults.numeral_style),
        weather_enabled: read_or(store, WEATHER_ENABLED, defaults.weather_enabled),
        forex_enabled: read_or(store, FOREX_ENABLED, defaults.forex_enabled),
        news_enabled: read_or(store, NEWS_ENABLED, defaults.news_enabled),
        bazar_enabled: read_or(store, BAZAR_ENABLED, defaults.bazar_enabled),
        rashifal_enabled: read_or(store, RASHIFAL_ENABLED, defaults.rashifal_enabled),
        radio_enabled: read_or(store, RADIO_ENABLED, defaults.radio_enabled),
        weather_location: read_or(store, WEATHER_LOCATION, defaults.weather_location),
        forex_favourites: read_or(store, FOREX_FAVOURITES, defaults.forex_favourites),
        vegetable_favourites: read_or(store, VEGETABLE_FAVOURITES, defaults.vegetable_favourites),
        stock_watchlist: read(store, STOCK_WATCHLIST),
        selected_rashi: read(store, SELECTED_RASHI),
        shows_dock_icon: read_or(store, SHOWS_DOCK_ICON, defaults.shows_dock_icon),
        notify_holiday_eve: notify.eve_of_public_holiday,
        notify_festival_eve: notify.eve_of_festival,
        radio_favourites: read_or(store, RADIO_FAVOURITES, defaults.radio_favourites),
    }
}

/// Serialises the whole of the user's data to a JSON string, which the frontend
/// then hands to a save dialog.
#[tauri::command]
pub fn export_backup(app: AppHandle<Wry>) -> Result<String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let preferences = preferences_from_store(&store);
    let day_plans: Vec<DayPlan> = read_or(&store, PLANS_KEY, Vec::new());

    SajiloBackup::new(preferences, day_plans, chrono::Utc::now())
        .encode()
        .map_err(|error| error.to_string())
}

/// What an import actually changed, so the UI can confirm rather than just
/// claiming success.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub day_plans: usize,
    pub exported_at: String,
}

/// Replaces preferences and plans with the backup's.
///
/// Deliberately a replace, not a merge: a user restoring a backup expects the
/// state they saved, and silently merging two sets of plans would leave them
/// with duplicates they never made.
#[tauri::command]
pub fn import_backup(app: AppHandle<Wry>, contents: String) -> Result<ImportSummary> {
    let backup = SajiloBackup::decode(&contents).map_err(|error| error.to_string())?;
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let prefs = &backup.preferences;

    set(&store, MENU_BAR_FORMAT, &prefs.menu_bar_format);
    set(
        &store,
        CUSTOM_MENU_BAR_SHOWS_FLAG,
        prefs.custom_menu_bar_shows_flag,
    );
    set(
        &store,
        CUSTOM_MENU_BAR_SHOWS_YEAR,
        prefs.custom_menu_bar_shows_year,
    );
    set(&store, LANGUAGE, &prefs.app_language);
    set(&store, NUMERAL_STYLE, &prefs.numeral_style);
    set(&store, WEATHER_ENABLED, prefs.weather_enabled);
    set(&store, FOREX_ENABLED, prefs.forex_enabled);
    set(&store, NEWS_ENABLED, prefs.news_enabled);
    set(&store, BAZAR_ENABLED, prefs.bazar_enabled);
    set(&store, RASHIFAL_ENABLED, prefs.rashifal_enabled);
    set(&store, RADIO_ENABLED, prefs.radio_enabled);
    set(&store, WEATHER_LOCATION, &prefs.weather_location);
    set(&store, FOREX_FAVOURITES, &prefs.forex_favourites);
    set(&store, VEGETABLE_FAVOURITES, &prefs.vegetable_favourites);
    if let Some(watchlist) = &prefs.stock_watchlist {
        set(&store, STOCK_WATCHLIST, watchlist);
    }
    if let Some(rashi) = &prefs.selected_rashi {
        set(&store, SELECTED_RASHI, rashi);
    }
    set(&store, RADIO_FAVOURITES, &prefs.radio_favourites);
    set(&store, SHOWS_DOCK_ICON, prefs.shows_dock_icon);
    crate::system::dock::set_hidden(&app, !prefs.shows_dock_icon);

    // `hour` has no Preferences field — it is not part of the Swift export —
    // so the existing stored value survives an import rather than resetting
    // to the default every time.
    let mut notify: NotificationOptions =
        read_or(&store, NOTIFICATION_OPTIONS, NotificationOptions::default());
    notify.eve_of_public_holiday = prefs.notify_holiday_eve;
    notify.eve_of_festival = prefs.notify_festival_eve;
    set(&store, NOTIFICATION_OPTIONS, notify);

    set(&store, PLANS_KEY, &backup.day_plans);
    store.save().map_err(|e| e.to_string())?;

    // The label must reflect the imported preferences immediately, or the tray
    // keeps showing the old format until the next midnight.
    crate::tray::refresh_title(&app);

    Ok(ImportSummary {
        day_plans: backup.day_plans.len(),
        exported_at: backup.exported_at.to_rfc3339(),
    })
}

/// Whether this looks like a first run, which is what gates the "import from a
/// Sajilo backup" offer. Asking every launch would be nagging.
#[tauri::command]
pub fn is_first_run(app: AppHandle<Wry>) -> bool {
    let Ok(store) = app.store(STORE_FILE) else {
        return true;
    };
    store.get("hasLaunched").is_none()
}

#[tauri::command]
pub fn mark_launched(app: AppHandle<Wry>) -> Result<()> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set("hasLaunched", serde_json::Value::Bool(true));
    store.save().map_err(|e| e.to_string())
}
