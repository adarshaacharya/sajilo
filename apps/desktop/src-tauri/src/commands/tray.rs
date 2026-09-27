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
        crate::window::hide(&window);
    }
}

/// The page saw the pointer enter or leave the popover. On Linux this is how
/// the shell tells a click away from a focus drop nobody asked for; see
/// `window::hide_on_blur`.
#[tauri::command]
pub fn popover_pointer(over: bool) {
    crate::window::set_pointer_over(over);
}

/// Whether the popover is kept open with the header's pin.
#[tauri::command]
pub fn popover_kept() -> bool {
    crate::window::is_kept()
}

/// The header's pin: keep the popover open and movable, or let it close on a
/// click away and open at the tray again.
#[tauri::command]
pub fn set_popover_kept(app: AppHandle<Wry>, kept: bool) {
    if let Some(window) = crate::window::main_window(&app) {
        crate::window::set_kept(&window, kept);
    }
}

/// Keeps the popover open while it shows a dialog of its own, and hands focus
/// back to it when the dialog closes.
#[tauri::command]
pub fn pin_popover(app: AppHandle<Wry>, pinned: bool) {
    crate::window::set_pinned(pinned);
    if !pinned && let Some(window) = crate::window::main_window(&app) {
        let _ = window.set_focus();
    }
}

/// Puts "Restart to update" in the tray menu while an installed update waits,
/// in the user's language; `None` takes it out again.
#[tauri::command]
pub fn set_tray_update(app: AppHandle<Wry>, label: Option<String>) {
    crate::tray::set_update_ready(&app, label.as_deref());
}
