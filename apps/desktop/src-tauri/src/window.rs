//! The popover.
//!
//! One rule governs this file: the window is **hidden, never closed.** Closing
//! destroys the webview, which throws away the whole React tree — every loaded
//! feed, every scroll position, the radio stream mid-play — and makes the next
//! tray click pay a cold start. Hiding keeps all of it.

use tauri::{AppHandle, Manager, WebviewWindow};

pub const MAIN: &str = "main";

pub fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN)
}

/// Tray click: show it if hidden, dismiss it if already up.
pub fn toggle(app: &AppHandle) {
    let Some(window) = main_window(app) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        show(&window);
    }
}

pub fn show(window: &WebviewWindow) {
    position_at_tray(window);
    let _ = window.show();
    let _ = window.set_focus();
}

/// Anchors the popover to the tray icon.
///
/// Tray-anchored positioning differs per platform and per multi-monitor setup,
/// which is what `tauri-plugin-positioner` exists to absorb. If it cannot place
/// the window — a Linux desktop with no tray host, say — the window still shows
/// wherever it last was, because an unplaced popover beats no popover.
fn position_at_tray(window: &WebviewWindow) {
    use tauri_plugin_positioner::{Position, WindowExt};

    let placement = if cfg!(target_os = "macos") {
        Position::TrayBottomCenter
    } else {
        // Windows and most Linux panels sit at the bottom of the screen.
        Position::TrayCenter
    };
    if window.move_window(placement).is_err() {
        let _ = window.move_window(Position::TopRight);
    }
}

/// Dismiss on blur, the way a menu-bar popover is expected to behave.
///
/// Skipped in debug builds: with devtools open the window loses focus the
/// instant you click into the inspector, which makes the app impossible to
/// debug.
pub fn hide_on_blur(window: &WebviewWindow, focused: bool) {
    if focused || cfg!(debug_assertions) {
        return;
    }
    let _ = window.hide();
}
