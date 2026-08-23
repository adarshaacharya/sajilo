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
        hide(&window);
    } else {
        show(&window);
    }
}

/// Puts the popover away, keeping the app alive in the tray.
///
/// Every dismissal goes through here so the tray menu can say what the next
/// click will do — see [`crate::tray::set_popover_shown`].
pub fn hide(window: &WebviewWindow) {
    let _ = window.hide();
    #[cfg(target_os = "linux")]
    crate::tray::set_popover_shown(window.app_handle(), false);
}

pub fn show(window: &WebviewWindow) {
    position_at_tray(window);
    // Re-assert clear + vibrancy each open — some macOS builds repaint opaque after hide.
    let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
    #[cfg(target_os = "macos")]
    polish_macos_chrome(window);
    let _ = window.show();
    let _ = window.set_focus();
    #[cfg(target_os = "linux")]
    crate::tray::set_popover_shown(window.app_handle(), true);
}

/// Anchors the popover to the tray icon.
///
/// Tray-anchored positioning differs per platform and per multi-monitor setup,
/// which is what `tauri-plugin-positioner` exists to absorb. If it cannot place
/// the window — a Linux desktop with no tray host, say — the window still shows
/// wherever it last was, because an unplaced popover beats no popover.
fn position_at_tray(window: &WebviewWindow) {
    use tauri_plugin_positioner::{Position, WindowExt};

    // Linux gets pointer-anchored placement; everything else uses the plugin's
    // tray anchors. See [`center_under_cursor`] for why Linux is special.
    #[cfg(target_os = "linux")]
    let placed = center_under_cursor(window);
    #[cfg(not(target_os = "linux"))]
    let placed = false;

    if !placed {
        let placement = if cfg!(target_os = "macos") {
            Position::TrayBottomCenter
        } else {
            // Windows panels sit at the bottom of the screen.
            Position::TrayCenter
        };
        if window.move_window(placement).is_err() {
            let _ = window.move_window(Position::TopRight);
        }
    }
}

/// Opens the popover under the pointer, which on Linux means under the tray
/// icon.
///
/// macOS hands the app the tray icon's frame; Linux hands it nothing — the
/// StatusNotifier protocol carries no geometry and delivers no click events
/// (see [`crate::tray`]), so `tauri-plugin-positioner`'s tray anchors all
/// collapse to a screen corner there. What Linux *does* give is the pointer, and
/// the gesture that opens the popover pins it usefully: the icon is clicked, the
/// menu opens directly beneath it, and the one item is clicked straight below —
/// so the pointer sits under the icon at that moment. Centring the window on it
/// lands the popover under the icon, and because the gesture is the same every
/// time, it lands there consistently.
///
/// Clamped to the monitor work area so an icon near an edge cannot shove the
/// window off-screen, and hung from the top of that area so it sits just under
/// the panel.
#[cfg(target_os = "linux")]
fn center_under_cursor(window: &WebviewWindow) -> bool {
    let Ok(cursor) = window.cursor_position() else {
        return false;
    };
    // The pointer picks the monitor, so a second screen with its own panel is
    // handled without special-casing.
    let monitor = match window.monitor_from_point(cursor.x, cursor.y) {
        Ok(Some(monitor)) => monitor,
        _ => match window.primary_monitor() {
            Ok(Some(monitor)) => monitor,
            _ => return false,
        },
    };
    let Ok(size) = window.outer_size() else {
        return false;
    };

    let area = monitor.work_area();
    let width = i32::try_from(size.width).unwrap_or(i32::MAX);
    let leftmost = area.position.x;
    let rightmost = leftmost + i32::try_from(area.size.width).unwrap_or(i32::MAX) - width;
    #[allow(clippy::cast_possible_truncation)]
    let centered = cursor.x.round() as i32 - width / 2;

    let position = tauri::PhysicalPosition::new(
        centered.clamp(leftmost, rightmost.max(leftmost)),
        area.position.y,
    );
    window.set_position(position).is_ok()
}

/// Dismiss on blur, the way a menu-bar popover is expected to behave.
///
/// Set `SAJILO_NO_BLUR_HIDE=1` to keep the window up when it loses focus: with
/// devtools open, clicking into the inspector blurs the popover and would
/// otherwise dismiss the thing being inspected.
///
/// Linux is exempt entirely. GNOME/Wayland drops keyboard focus from an
/// undecorated, always-on-top, skip-taskbar popover for reasons the user never
/// triggered — in testing, focus was lost a couple of seconds after launch with
/// no interaction at all — so a focus-out is not a reliable "the user clicked
/// away" signal there. Dismissing on it made the whole app look like it opened
/// to nothing. On Linux the popover is instead toggled from the tray icon (see
/// [`toggle`]); macOS and Windows keep the click-away dismissal.
pub fn hide_on_blur(window: &WebviewWindow, focused: bool) {
    // Linux: never auto-hide; the tray menu is the only dismiss.
    #[cfg(target_os = "linux")]
    let _ = (window, focused);
    #[cfg(not(target_os = "linux"))]
    {
        if focused || std::env::var_os("SAJILO_NO_BLUR_HIDE").is_some() {
            return;
        }
        hide(window);
    }
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
        NSVisualEffectMaterial, NSVisualEffectState, apply_vibrancy, clear_vibrancy,
    };

    let _ = clear_vibrancy(window);
    let _ = apply_vibrancy(
        window,
        NSVisualEffectMaterial::Popover,
        Some(NSVisualEffectState::Active),
        Some(14.0),
    );
}
