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
    // Re-assert clear + vibrancy each open — some macOS builds repaint opaque after hide.
    let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
    #[cfg(target_os = "macos")]
    polish_macos_chrome(window);
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
/// Set `SAJILO_NO_BLUR_HIDE=1` to keep the window up when it loses focus: with
/// devtools open, clicking into the inspector blurs the popover and would
/// otherwise dismiss the thing being inspected.
pub fn hide_on_blur(window: &WebviewWindow, focused: bool) {
    if focused || std::env::var_os("SAJILO_NO_BLUR_HIDE").is_some() {
        return;
    }
    let _ = window.hide();
}

/// Clear NSWindow fill + apply popover vibrancy (Swift Patro / `.regularMaterial`).
///
/// CSS alone cannot frost the desk behind a WKWebView; that needs an
/// `NSVisualEffectView` behind the web content. Call this from setup and again
/// on each show — hide/show can leave an opaque plate on some macOS builds.
#[cfg(target_os = "macos")]
pub fn polish_macos_chrome(window: &WebviewWindow) {
    clear_macos_background(window);
    apply_macos_vibrancy(window);
}

/// Make the native window layers fully clear so a CSS-rounded shell can clip.
///
/// Tauri's `transparent: true` alone leaves the `NSWindow` opaque on macOS;
/// without this, `border-radius` paints against a square black/white plate.
#[cfg(target_os = "macos")]
fn clear_macos_background(window: &WebviewWindow) {
    use objc2_app_kit::{NSColor, NSWindow};

    let Ok(ptr) = window.ns_window() else {
        return;
    };
    // SAFETY: Tauri owns the NSWindow for the lifetime of the WebviewWindow.
    let ns_window = unsafe { &*(ptr as *const NSWindow) };
    ns_window.setOpaque(false);
    ns_window.setBackgroundColor(Some(&NSColor::clearColor()));
}

/// Menu-bar popover material with matching corner radius.
///
/// `apply_vibrancy` always inserts a new effect view, so clear first to avoid
/// stacking on repeated show().
#[cfg(target_os = "macos")]
fn apply_macos_vibrancy(window: &WebviewWindow) {
    use window_vibrancy::{
        apply_vibrancy, clear_vibrancy, NSVisualEffectMaterial, NSVisualEffectState,
    };

    let _ = clear_vibrancy(window);
    let _ = apply_vibrancy(
        window,
        NSVisualEffectMaterial::Popover,
        Some(NSVisualEffectState::Active),
        Some(14.0),
    );
}
