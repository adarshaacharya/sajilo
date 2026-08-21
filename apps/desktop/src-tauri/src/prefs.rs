//! Reading user preferences from the local SQLite database.
//!
//! The tray is built before any webview exists, so it cannot ask the frontend
//! what the user picked — it reads the same database the Settings screen writes.

use crate::db;
use crate::tray::title::{CustomMenuBar, MenuBarFormat};
use sajilo_api::weather::WeatherLocation;
use sajilo_core::numerals::NumeralStyle;
use tauri::{AppHandle, Wry};

pub const MENU_BAR_FORMAT: &str = "menuBarFormat";
pub const NUMERAL_STYLE: &str = "numeralStyle";
pub const CUSTOM_MENU_BAR_SHOWS_FLAG: &str = "customMenuBarShowsFlag";
pub const CUSTOM_MENU_BAR_SHOWS_YEAR: &str = "customMenuBarShowsYear";
/// Appends `HH:MM` to whatever date format is already showing — composes with
/// every `MenuBarFormat`, not a format of its own.
pub const SHOW_TRAY_TIME: &str = "showTrayTime";
// The same stable key the app uses, so an imported backup lands where the app
// already looks.

// Last good payload per remote module. Cached on disk so a cold start against
// a dead upstream still has yesterday's value to label as stale, and kept one
// key per feed so a single unreadable entry cannot take the others down.
pub const BAZAR_METALS_KEY: &str = "bazar.metals.v1";
pub const BAZAR_FUEL_KEY: &str = "bazar.fuel.v1";
pub const BAZAR_VEGETABLES_KEY: &str = "bazar.vegetables.v1";
pub const STOCKS_KEY: &str = "stocks.v1";
pub const RASHIFAL_KEY: &str = "rashifal.v1";
pub const RADIO_KEY: &str = "radio.v1";
pub const WEATHER_KATHMANDU_KEY: &str = "weather.kathmandu.v1";
pub const WEATHER_POKHARA_KEY: &str = "weather.pokhara.v1";
pub const WEATHER_LALITPUR_KEY: &str = "weather.lalitpur.v1";
pub const FOREX_KEY: &str = "forex.v1";
pub const NEWS_KEY: &str = "news.v1";
/// Same key the Swift app used, so a story resolved once there is not
/// re-fetched here after a migration.
pub const ARTICLE_DATES_KEY: &str = "articleDates.v1";

pub const WEATHER_LOCATION: &str = "weatherLocation";
pub const WEATHER_ENABLED: &str = "weatherEnabled";
pub const FOREX_ENABLED: &str = "forexEnabled";
pub const NEWS_ENABLED: &str = "newsEnabled";
pub const BAZAR_ENABLED: &str = "bazarEnabled";
pub const RASHIFAL_ENABLED: &str = "rashifalEnabled";
pub const RADIO_ENABLED: &str = "radioEnabled";
pub const FOREX_FAVOURITES: &str = "forexFavourites";
pub const LANGUAGE: &str = "language";
pub const SHOWS_DOCK_ICON: &str = "showsDockIcon";
pub const VEGETABLE_FAVOURITES: &str = "vegetableFavourites";
pub const STOCK_WATCHLIST: &str = "stockWatchlist";
pub const SELECTED_RASHI: &str = "selectedRashi";
pub const RADIO_FAVOURITES: &str = "radioFavourites";
/// Same key `commands/notify.rs` reads/writes — kept here too since backup
/// import/export needs it and that module's copy is private.
pub const NOTIFICATION_OPTIONS: &str = "notificationOptions";

/// Falls back to the defaults rather than failing: an unreadable preference
/// should cost the user their choice for one launch, not the tray label.
pub fn tray_preferences(
    app: &AppHandle<Wry>,
) -> (MenuBarFormat, NumeralStyle, CustomMenuBar, bool) {
    fn read<T: serde::de::DeserializeOwned + Default>(app: &AppHandle<Wry>, key: &str) -> T {
        db::get_json(app, key)
            .ok()
            .flatten()
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default()
    }
    fn read_bool(app: &AppHandle<Wry>, key: &str, default: bool) -> bool {
        db::get_json(app, key)
            .ok()
            .flatten()
            .and_then(|value| value.as_bool())
            .unwrap_or(default)
    }
    (
        read(app, MENU_BAR_FORMAT),
        read(app, NUMERAL_STYLE),
        CustomMenuBar {
            show_flag: read_bool(app, CUSTOM_MENU_BAR_SHOWS_FLAG, true),
            show_year: read_bool(app, CUSTOM_MENU_BAR_SHOWS_YEAR, true),
        },
        read_bool(app, SHOW_TRAY_TIME, false),
    )
}

/// Which city the weather module fetches for. Kept stable for backups.
pub fn weather_location(app: &AppHandle<Wry>) -> WeatherLocation {
    db::get_json(app, WEATHER_LOCATION)
        .ok()
        .flatten()
        .and_then(|value| value.as_str().map(str::to_owned))
        .and_then(|key| WeatherLocation::from_key(&key))
        .unwrap_or_default()
}
