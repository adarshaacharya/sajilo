//! Reading user preferences from the local SQLite database.
//!
//! The tray is built before any webview exists, so it cannot ask the frontend
//! what the user picked — it reads the same database the Settings screen writes.

use crate::db;
use crate::tray::title::{CustomMenuBar, MenuBarFormat};
use sajilo_core::numerals::NumeralStyle;
use sajilo_core::places::{self, Place};
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
/// ShareHub's live board, overlaid on the ShareSansar snapshot in session.
pub const STOCKS_LIVE_KEY: &str = "stocksLive.v1";
pub const IPOS_KEY: &str = "ipos.v1";
pub const DIVIDENDS_KEY: &str = "dividends.v1";
pub const MUTUAL_FUNDS_KEY: &str = "mutualFunds.v1";
pub const NEPSE_INTRADAY_KEY: &str = "nepseIntraday.v1";
pub const RASHIFAL_KEY: &str = "rashifal.v1";
pub const RADIO_KEY: &str = "radio.v1";
/// One cache entry per place: `weather.kathmandu.v1`. The three cities that
/// came before the place list used the same spelling.
pub fn weather_cache_key(place_id: &str) -> String {
    format!("weather.{place_id}.v1")
}
pub const FOREX_KEY: &str = "forex.v1";
/// v3 invalidates digests written before the technology and sports sources
/// joined the publisher catalog. Otherwise their picker options can filter an
/// older cached digest to zero headlines until its normal refresh window.
pub const NEWS_KEY: &str = "news.v3";
pub const ANNOUNCEMENT_KEY: &str = "announcement.v1";
/// Same key the Swift app used, so a story resolved once there is not
/// re-fetched here after a migration.
pub const ARTICLE_DATES_KEY: &str = "articleDates.v1";

/// The home place: the first pin, shown on the home screen and in the tray.
/// Kept under its original name so backups and older exports still carry it.
pub const WEATHER_LOCATION: &str = "weatherLocation";
/// Every pinned place, the home place first. Written by the weather screen.
pub const WEATHER_PINS: &str = "weatherPins";
pub const WEATHER_ENABLED: &str = "weatherEnabled";
pub const FOREX_ENABLED: &str = "forexEnabled";
pub const NEWS_ENABLED: &str = "newsEnabled";
pub const BAZAR_ENABLED: &str = "bazarEnabled";
pub const RASHIFAL_ENABLED: &str = "rashifalEnabled";
pub const RADIO_ENABLED: &str = "radioEnabled";
pub const KEEPER_ENABLED: &str = "keeperEnabled";
pub const FOCUS_ENABLED: &str = "focusEnabled";
pub const FOREX_FAVOURITES: &str = "forexFavourites";
pub const LANGUAGE: &str = "language";
pub const SHOWS_DOCK_ICON: &str = "showsDockIcon";
/// Set once, the first time Sajilo runs, when launch-at-login is turned on for
/// the user. Its presence — not its value — is what stops that from happening
/// twice, so switching the toggle off stays switched off.
pub const AUTOSTART_DEFAULTED: &str = "autostartDefaulted";
/// Set once the "keep Sajilo on your taskbar" card is dismissed. Written by the
/// frontend; Windows only.
pub const TRAY_PIN_TIP_DISMISSED: &str = "trayPinTipDismissed";
/// Set once the matching one-time Windows notification has been sent.
pub const TRAY_PIN_NOTIFIED: &str = "trayPinNotified";
pub const VEGETABLE_FAVOURITES: &str = "vegetableFavourites";
pub const STOCK_WATCHLIST: &str = "stockWatchlist";
/// Monthly SIP payment schedules, per fund. Written by `commands::sips`.
pub const SIP_PLANS: &str = "fundSips";
/// Issue ids the user marked as applied, written by the IPO detail screen.
/// Closing-day reminders skip these.
pub const IPO_APPLIED: &str = "ipoApplied";
pub const SELECTED_RASHI: &str = "selectedRashi";
pub const RADIO_FAVOURITES: &str = "radioFavourites";
/// Same key `commands/notify.rs` reads/writes — kept here too since backup
/// import/export needs it and that module's copy is private.
pub const NOTIFICATION_OPTIONS: &str = "notificationOptions";
/// One anonymous aggregate count per UTC day. On unless switched off — a
/// missing value is a count nobody turned off.
pub const USAGE_INSIGHTS_ENABLED: &str = "usageInsightsEnabled";
pub const USAGE_INSIGHTS_LAST_PING_DAY: &str = "usageInsightsLastPingDay";
pub const USAGE_INSIGHTS_LAST_PING_VERSION: &str = "usageInsightsLastPingVersion";
/// A random v4 uuid, minted on the first ping that carries one, so the daily
/// counts can tell one install returning for a month from thirty installs
/// arriving once. Nothing about the machine or the user goes into it, and
/// switching the count off in Settings stops it being sent at all — it stays on
/// disk, unsent, so switching back on is the same install rather than a new
/// one. Cleared on backup import — see
/// `commands::backup` — so restoring a backup onto a second machine makes two
/// installs, not one counted twice.
pub const USAGE_INSIGHTS_INSTALL_ID: &str = "usageInsightsInstallId";

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

/// The home place. An id this build does not know falls back to Kathmandu.
pub fn weather_location(app: &AppHandle<Wry>) -> &'static Place {
    let id = db::get_json(app, WEATHER_LOCATION)
        .ok()
        .flatten()
        .and_then(|value| value.as_str().map(str::to_owned))
        .unwrap_or_default();
    places::find_or_default(&id)
}
