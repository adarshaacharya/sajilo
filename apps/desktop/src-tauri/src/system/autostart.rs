//! Launch at login.
//!
//! A menu-bar calendar that is not running shows nothing, so this is the setting
//! that makes Sajilo useful on the second day. It is therefore on from the
//! first launch — a tray app that quietly stops existing after a reboot is one
//! people conclude is broken. What makes that fair rather than sneaky is that
//! it is done exactly once, and the switch that undoes it sits in Settings
//! under Startup, where someone looking for it will look.

use crate::{
    db,
    prefs::{AUTOSTART_DEFAULTED, SHOWS_DOCK_ICON},
};
use tauri::{AppHandle, Wry};
use tauri_plugin_autostart::ManagerExt;

type Result<T> = std::result::Result<T, String>;

/// Turns launch-at-login on, once, for an install that has never run before.
///
/// Returns whether this was that first run, so the caller can also show the
/// popover — otherwise the first thing a new user sees after opening the app is
/// nothing at all, the window being hidden and the icon easy to miss.
///
/// Keyed on its own flag rather than on whether autostart is currently enabled:
/// reading the live state would re-enable it every launch for anyone who had
/// deliberately turned it off, which is precisely the behaviour that earns an
/// uninstall.
pub fn apply_first_run_default(app: &AppHandle<Wry>) -> bool {
    let already_done = db::get_json(app, AUTOSTART_DEFAULTED)
        .ok()
        .flatten()
        .is_some();
    if already_done {
        return false;
    }

    // Recorded first. A registration that fails — a locked-down Mac, a Linux
    // desktop with no autostart directory — must not leave this retrying on
    // every launch.
    let _ = db::set_json(app, AUTOSTART_DEFAULTED, &serde_json::Value::Bool(true));
    let _ = app.autolaunch().enable();
    true
}

#[tauri::command]
pub fn is_autostart_enabled(app: AppHandle<Wry>) -> Result<bool> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_autostart(app: AppHandle<Wry>, enabled: bool) -> Result<bool> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| e.to_string())?;
    } else {
        manager.disable().map_err(|e| e.to_string())?;
    }
    // The new state is read back rather than assumed: on macOS the login item
    // can fail to register without returning an error, and the UI must not show
    // a toggle that lies.
    manager.is_enabled().map_err(|e| e.to_string())
}

/// macOS only. Elsewhere the window is kept off the taskbar by `skipTaskbar`,
/// and there is no equivalent switch to offer.
#[tauri::command]
pub fn set_dock_icon_visible(app: AppHandle<Wry>, visible: bool) {
    crate::system::dock::set_hidden(&app, !visible);
    let _ = db::set_json(&app, SHOWS_DOCK_ICON, &serde_json::Value::Bool(visible));
}

/// Read back on Settings mount, and on backup import, so the toggle reflects
/// what was last chosen rather than defaulting to hidden every launch.
#[tauri::command]
pub fn is_dock_icon_visible(app: AppHandle<Wry>) -> bool {
    db::get_json(&app, SHOWS_DOCK_ICON)
        .ok()
        .flatten()
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}
