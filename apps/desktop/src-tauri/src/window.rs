//! The popover.
//!
//! One rule governs this file: the window is **hidden, never closed.** Closing
//! destroys the webview, which throws away the whole React tree — every loaded
//! feed, every scroll position, the radio stream mid-play — and makes the next
//! tray click pay a cold start. Hiding keeps all of it.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager, WebviewWindow};

/// Set while the popover has opened a dialog of its own (a file picker, a
/// "delete this?" prompt). The dialog takes focus, and a focus-out is
/// otherwise read as "the user clicked away".
static PINNED: AtomicBool = AtomicBool::new(false);

/// Whether the popover has been opened since launch; see [`show`].
#[cfg(target_os = "macos")]
static SHOWN_ONCE: AtomicBool = AtomicBool::new(false);

pub fn set_pinned(pinned: bool) {
    PINNED.store(pinned, Ordering::SeqCst);
}

pub const MAIN: &str = "main";
pub const UPDATE: &str = "update";

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
    crate::commands::telemetry::record(window.app_handle(), "action.popover-open");
    // The first open comes at launch, before macOS has finished placing the
    // menu-bar icon: its frame first reads as a corner of the screen, then
    // moves as the date beside it is drawn and widens it leftwards. Showing
    // then left the popover at the bottom of the screen, or off to the right
    // of the date. So the first open waits until the icon's frame has held
    // still for a moment; every later one is a click on a settled icon.
    #[cfg(target_os = "macos")]
    if !SHOWN_ONCE.swap(true, Ordering::SeqCst) {
        let window = window.clone();
        tauri::async_runtime::spawn(async move {
            let mut last = None;
            let mut steady = 0;
            // At most ~1.5 s; the icon normally settles within a few frames.
            for _ in 0..30 {
                let pause = tauri::async_runtime::spawn_blocking(|| {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                });
                if pause.await.is_err() {
                    break;
                }
                let now = tray_frame(&window);
                steady = if now.is_some() && now == last {
                    steady + 1
                } else {
                    0
                };
                last = now;
                if steady >= 2 {
                    break;
                }
            }
            let target = window.clone();
            let _ = window.run_on_main_thread(move || show_now(&target));
        });
        return;
    }
    show_now(window);
}

fn show_now(window: &WebviewWindow) {
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
/// which is what `tauri-plugin-positioner` exists to absorb.
///
/// The plugin learns where the icon is from tray *events*, and Linux emits
/// none — `tray-icon`'s GTK backend returns `None` for the icon's rect — so
/// every `Tray*` placement fails there with "Tray position not set". The
/// fallback is centre rather than a corner: without a tray anchor there is no
/// edge the popover belongs against, and an undecorated transparent window
/// pinned to a corner reads as a rendering glitch rather than as the app.
fn position_at_tray(window: &WebviewWindow) {
    use tauri_plugin_positioner::{Position, WindowExt};

    // Linux gets pointer-anchored placement; everything else uses the plugin's
    // tray anchors. See [`center_under_cursor`] for why Linux is special.
    #[cfg(target_os = "linux")]
    let placed = center_under_cursor(window);
    #[cfg(target_os = "windows")]
    let placed = above_taskbar(window);
    #[cfg(target_os = "macos")]
    let placed = under_menu_bar_icon(window);

    if !placed {
        let placement = if cfg!(target_os = "macos") {
            Position::TrayBottomCenter
        } else {
            // Windows and most Linux panels sit at the bottom of the screen.
            Position::TrayCenter
        };
        if window.move_window(placement).is_err() {
            let _ = window.move_window(Position::Center);
        }
    }
}

/// Hangs the popover from the menu-bar icon, centred under it, in screen
/// points.
///
/// Points, not pixels, because Macs mix screens: a Retina laptop at 2× beside
/// an external display at 1× is common. The icon's frame arrives in its own
/// screen's pixels, and the positioner plugin places the window in the pixels
/// of whichever screen the window was last on — so a popover last shown on the
/// 1× display opened well to the side of an icon on the 2× one. Every screen
/// shares one space in points, so converting once, with the icon's own screen,
/// puts it right on all of them.
#[cfg(target_os = "macos")]
fn under_menu_bar_icon(window: &WebviewWindow) -> bool {
    use tauri::LogicalPosition;

    let app = window.app_handle();
    let Some(Ok(Some(rect))) = app.tray_by_id("main").map(|tray| tray.rect()) else {
        return false;
    };
    let Ok(monitors) = app.available_monitors() else {
        return false;
    };
    let pixels = rect.position.to_physical::<f64>(1.0);
    let pixel_size = rect.size.to_physical::<f64>(1.0);
    let width = window
        .outer_size()
        .ok()
        .and_then(|size| {
            window
                .scale_factor()
                .ok()
                .map(|scale| f64::from(size.width) / scale)
        })
        .unwrap_or(380.0);

    for monitor in monitors {
        let scale = monitor.scale_factor();
        let left = f64::from(monitor.position().x) / scale;
        let top = f64::from(monitor.position().y) / scale;
        let right = left + f64::from(monitor.size().width) / scale;
        let (x, y) = (pixels.x / scale, pixels.y / scale);
        let (icon_width, icon_height) = (pixel_size.width / scale, pixel_size.height / scale);
        // The icon's screen is the one whose menu-bar strip holds it.
        if x < left || x >= right || y < top || y >= top + 60.0 {
            continue;
        }
        // Centred under the icon, kept on its screen near the edges.
        let wanted = x + icon_width / 2.0 - width / 2.0;
        let at_x = wanted.clamp(left + 8.0, (right - width - 8.0).max(left + 8.0));
        let _ = window.set_position(LogicalPosition::new(at_x, y + icon_height));
        return true;
    }
    false
}

/// The menu-bar icon's frame, in whole physical pixels, once it has a real
/// place: somewhere in the top strip of one of the screens, where menu bars
/// are. Before macOS lays the icon out its frame is at the screen's origin,
/// which is not.
#[cfg(target_os = "macos")]
fn tray_frame(window: &WebviewWindow) -> Option<(i64, i64, i64)> {
    let app = window.app_handle();
    let rect = app.tray_by_id("main")?.rect().ok()??;
    let size = rect.size.to_physical::<f64>(1.0);
    let position = rect.position.to_physical::<f64>(1.0);
    if size.width <= 0.0 || size.height <= 0.0 {
        return None;
    }
    let on_a_menu_bar = app.available_monitors().ok()?.iter().any(|monitor| {
        let origin = monitor.position();
        let area = monitor.size();
        let left = f64::from(origin.x);
        let top = f64::from(origin.y);
        position.x >= left
            && position.x < left + f64::from(area.width)
            && position.y >= top
            && position.y < top + 120.0 * monitor.scale_factor()
    });
    // Whole pixels, so "the same frame twice" is an exact comparison.
    #[allow(clippy::cast_possible_truncation)]
    on_a_menu_bar.then(|| {
        (
            position.x.round() as i64,
            position.y.round() as i64,
            size.width.round() as i64,
        )
    })
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

/// Where the tray icon was last clicked, in physical pixels. Windows only.
#[cfg(target_os = "windows")]
static TRAY_CLICK: std::sync::Mutex<Option<tauri::PhysicalPosition<f64>>> =
    std::sync::Mutex::new(None);

/// Remembers where the tray icon was clicked, for [`above_taskbar`].
#[cfg(target_os = "windows")]
pub fn remember_tray_click(position: tauri::PhysicalPosition<f64>) {
    if let Ok(mut click) = TRAY_CLICK.lock() {
        *click = Some(position);
    }
}

/// Opens the popover against the taskbar, lined up with the tray icon.
///
/// Anchoring to the icon itself, as the positioner's tray anchors do, breaks
/// when the icon lives in the ^ overflow panel: the popover opens above that
/// panel, and once Windows closes it the popover is left floating mid-screen.
/// Hanging it from the taskbar's edge instead puts it where Windows' own
/// flyouts open, whether the icon is pinned or tucked away.
///
/// The click (or, before any click, the pointer) picks the column and the
/// monitor; the work area decides which edge the taskbar is on.
#[cfg(target_os = "windows")]
fn above_taskbar(window: &WebviewWindow) -> bool {
    let anchor = TRAY_CLICK
        .lock()
        .ok()
        .and_then(|click| *click)
        .or_else(|| window.cursor_position().ok());
    let Some(anchor) = anchor else {
        return false;
    };
    let monitor = match window.monitor_from_point(anchor.x, anchor.y) {
        Ok(Some(monitor)) => monitor,
        _ => match window.primary_monitor() {
            Ok(Some(monitor)) => monitor,
            _ => return false,
        },
    };
    let Ok(size) = window.outer_size() else {
        return false;
    };

    #[allow(clippy::cast_possible_truncation)]
    let gap = (12.0 * monitor.scale_factor()).round() as i32;
    let width = i32::try_from(size.width).unwrap_or(i32::MAX);
    let height = i32::try_from(size.height).unwrap_or(i32::MAX);
    let area = monitor.work_area();
    let left = area.position.x;
    let top = area.position.y;
    let right = left + i32::try_from(area.size.width).unwrap_or(i32::MAX);
    let bottom = top + i32::try_from(area.size.height).unwrap_or(i32::MAX);

    #[allow(clippy::cast_possible_truncation)]
    let centered = anchor.x.round() as i32 - width / 2;
    let x = centered.clamp(left + gap, (right - width - gap).max(left + gap));
    // A taskbar docked at the top pushes the work area down from the
    // monitor's edge; anywhere else, the popover sits above the bottom one.
    let taskbar_on_top = top > monitor.position().y;
    let y = if taskbar_on_top {
        top + gap
    } else {
        (bottom - height - gap).max(top)
    };
    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .is_ok()
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
/// to nothing. On Linux the popover is instead toggled from the tray menu item
/// (see [`toggle`] and `tray::build`) or dismissed with Escape; macOS and
/// Windows keep the click-away dismissal.
pub fn hide_on_blur(window: &WebviewWindow, focused: bool) {
    // Linux: never auto-hide; the tray menu is the only dismiss.
    #[cfg(target_os = "linux")]
    let _ = (window, focused);

    #[cfg(not(target_os = "linux"))]
    {
        if focused
            || PINNED.load(Ordering::SeqCst)
            || std::env::var_os("SAJILO_NO_BLUR_HIDE").is_some()
        {
            return;
        }
        hide(window);
    }
}

/// Keeps the shadow only where it draws what we want.
///
/// On Windows 11 a borderless window's shadow comes with rounded corners that
/// match the card. On Windows 10 the same setting draws a 1px white border
/// around the whole, square window, which frames the transparent corners of
/// the rounded card in white. There, no shadow looks right.
#[cfg(target_os = "windows")]
pub fn fit_windows_shadow(window: &WebviewWindow) {
    if !crate::system::windows_version::is_windows_11() {
        let _ = window.set_shadow(false);
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
