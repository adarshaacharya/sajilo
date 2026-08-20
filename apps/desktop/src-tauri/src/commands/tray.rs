//! Letting Settings push a preference change to the tray.
//!
//! The tray reads the store, and the store is written by the webview — but
//! nothing tells the tray a write happened. Without this the menu-bar label
//! only picks up a new format or numeral style on the next launch.

use tauri::{AppHandle, Wry};

#[tauri::command]
pub fn refresh_tray(app: AppHandle<Wry>) {
    crate::tray::refresh_title(&app);
}

#[tauri::command]
pub fn quit_app(app: AppHandle<Wry>) {
    app.exit(0);
}

/// Called after the frontend opens an external link. The popover is
/// `alwaysOnTop`, so without this it stays focused and buries the freshly
/// opened browser window behind itself — the link opens, it just looks like
/// nothing happened.
#[tauri::command]
pub fn hide_popover(app: AppHandle<Wry>) {
    if let Some(window) = crate::window::main_window(&app) {
        let _ = window.hide();
    }
}
