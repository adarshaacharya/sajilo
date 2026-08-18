//! Launch at login.
//!
//! A menu-bar calendar that is not running shows nothing, so this is the setting
//! that makes Sajilo useful on the second day. It stays opt-in regardless: an
//! app that adds itself to login items uninvited is one people uninstall.

use tauri::{AppHandle, Wry};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_store::StoreExt;

use crate::prefs::{SHOWS_DOCK_ICON, STORE_FILE};

type Result<T> = std::result::Result<T, String>;

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
    if let Ok(store) = app.store(STORE_FILE) {
        store.set(SHOWS_DOCK_ICON, serde_json::Value::Bool(visible));
        let _ = store.save();
    }
}

/// Read back on Settings mount, and on backup import, so the toggle reflects
/// what was last chosen rather than defaulting to hidden every launch.
#[tauri::command]
pub fn is_dock_icon_visible(app: AppHandle<Wry>) -> bool {
    let Ok(store) = app.store(STORE_FILE) else {
        return false;
    };
    store
        .get(SHOWS_DOCK_ICON)
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}
