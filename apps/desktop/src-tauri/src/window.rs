//! The popover.
//!
//! One rule governs this file: the window is **hidden, never closed.** Closing
//! destroys the webview, which throws away the whole React tree — every loaded
//! feed, every scroll position, the radio stream mid-play — and makes the next
//! tray click pay a cold start. Hiding keeps all of it.

use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};

use tauri::{AppHandle, Manager, WebviewWindow};

/// Set while the popover has opened a dialog of its own (a file picker, a
/// "delete this?" prompt). The dialog takes focus, and a focus-out is
/// otherwise read as "the user clicked away".
static PINNED: AtomicBool = AtomicBool::new(false);

/// Whether the popover has been opened since launch; see [`show`].
#[cfg(target_os = "macos")]
static SHOWN_ONCE: AtomicBool = AtomicBool::new(false);

/// When the popover last opened, and whether it has held focus since: the
/// evidence [`hide_on_blur`] weighs on Linux before reading a focus-out as a
/// click away.
#[cfg(target_os = "linux")]
static SHOWN_AT: std::sync::Mutex<Option<std::time::Instant>> = std::sync::Mutex::new(None);
#[cfg(target_os = "linux")]
static FOCUSED_SINCE_SHOWN: AtomicBool = AtomicBool::new(false);

/// When a focus-out last put the popover away, and whether it was up when the
/// tray icon was last pressed; see [`tray_press`].
static BLUR_HIDDEN_AT: std::sync::Mutex<Option<std::time::Instant>> = std::sync::Mutex::new(None);
static UP_AT_PRESS: AtomicBool = AtomicBool::new(false);

/// How close together a focus-out and a press on the tray icon come when they
/// are one click. Both are the same mouse-down, a few milliseconds apart.
const PRESS_BLUR: std::time::Duration = std::time::Duration::from_millis(250);

pub fn set_pinned(pinned: bool) {
    PINNED.store(pinned, Ordering::SeqCst);
}

/// Whether the pointer is over the popover, as its page last reported:
/// [`POINTER_UNKNOWN`] until the page sees it enter or leave after an open.
/// The page always knows, on every platform and session, including a Wayland
/// one where the shell cannot read the pointer at all.
static POINTER_OVER: AtomicU8 = AtomicU8::new(POINTER_UNKNOWN);
const POINTER_UNKNOWN: u8 = 0;
const POINTER_IN: u8 = 1;
const POINTER_OUT: u8 = 2;

/// Kept open with the header's pin: a click away no longer dismisses it, it
/// can be dragged anywhere, and it reopens where it was left. Escape and the
/// tray still put it away.
static KEPT_OPEN: AtomicBool = AtomicBool::new(false);

/// Where a kept popover was last moved to, in logical pixels.
static KEPT_PLACE: std::sync::Mutex<Option<Place>> = std::sync::Mutex::new(None);

/// Stored as `{ "x": .., "y": .. }`: see [`save_kept`].
const KEPT_KEY: &str = "popover.keptOpen.v1";

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize)]
struct Place {
    x: f64,
    y: f64,
}

/// Reads whether the popover was left kept open, and where, at launch.
pub fn load_kept(app: &AppHandle) {
    let Ok(Some(value)) = crate::db::get_json(app, KEPT_KEY) else {
        return;
    };
    if value.is_null() {
        return;
    }
    KEPT_OPEN.store(true, Ordering::SeqCst);
    if let (Ok(place), Ok(mut kept)) = (serde_json::from_value::<Place>(value), KEPT_PLACE.lock()) {
        *kept = Some(place);
    }
}

pub fn is_kept() -> bool {
    KEPT_OPEN.load(Ordering::SeqCst)
}

/// The pin. Pinning keeps the popover where it is now; unpinning forgets the
/// place, so the next open is back under the tray icon.
pub fn set_kept(window: &WebviewWindow, kept: bool) {
    KEPT_OPEN.store(kept, Ordering::SeqCst);
    let place = kept.then(|| current_place(window)).flatten();
    if let Ok(mut stored) = KEPT_PLACE.lock() {
        *stored = place;
    }
    save_kept(window.app_handle());
}

/// Follows a kept popover as it is dragged. Kept in memory; written when it
/// is put away, not on every step of a drag.
pub fn remember_move(window: &WebviewWindow) {
    if !is_kept() {
        return;
    }
    if let (Some(place), Ok(mut stored)) = (current_place(window), KEPT_PLACE.lock()) {
        *stored = Some(place);
    }
}

fn current_place(window: &WebviewWindow) -> Option<Place> {
    let position = window.outer_position().ok()?;
    let scale = window.scale_factor().ok()?;
    Some(Place {
        x: f64::from(position.x) / scale,
        y: f64::from(position.y) / scale,
    })
}

/// `null` when not kept; the place when kept, or `{}` before it has one.
fn save_kept(app: &AppHandle) {
    let value = if is_kept() {
        KEPT_PLACE
            .lock()
            .ok()
            .and_then(|place| *place)
            .and_then(|place| serde_json::to_value(place).ok())
            .unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::Value::Null
    };
    let _ = crate::db::set_json(app, KEPT_KEY, &value);
}

/// Puts a kept popover back where it was left, if a connected screen still
/// shows that spot; otherwise it opens at the tray like any other.
fn place_kept(window: &WebviewWindow) -> bool {
    if !is_kept() {
        return false;
    }
    let Some(place) = KEPT_PLACE.lock().ok().and_then(|place| *place) else {
        return false;
    };
    let Ok(monitors) = window.available_monitors() else {
        return false;
    };
    let visible = monitors.iter().any(|monitor| {
        let scale = monitor.scale_factor();
        let left = f64::from(monitor.position().x) / scale;
        let top = f64::from(monitor.position().y) / scale;
        let right = left + f64::from(monitor.size().width) / scale;
        let bottom = top + f64::from(monitor.size().height) / scale;
        // Enough of the header on screen to grab it again.
        place.x + 60.0 >= left
            && place.x + 60.0 <= right
            && place.y >= top
            && place.y + 40.0 <= bottom
    });
    visible
        && window
            .set_position(tauri::LogicalPosition::new(place.x, place.y))
            .is_ok()
}

/// The page's report that the pointer entered or left the popover.
pub fn set_pointer_over(over: bool) {
    POINTER_OVER.store(
        if over { POINTER_IN } else { POINTER_OUT },
        Ordering::SeqCst,
    );
    #[cfg(target_os = "linux")]
    if !over && let Ok(mut left) = POINTER_LEFT_AT.lock() {
        *left = Some(std::time::Instant::now());
    }
}

pub const MAIN: &str = "main";
pub const UPDATE: &str = "update";

pub fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN)
}

/// Tray click: show it if hidden, dismiss it if already up.
/// The tray icon was pressed: notes whether the popover is up, so the release
/// can put it away rather than open it again.
///
/// Pressing the icon takes focus from the popover, and the focus-out hides it
/// (see [`hide_on_blur`]) before the release arrives. A toggle on the release
/// then found it hidden and opened it again, so clicking the icon to close
/// the popover made it blink and stay open. Whichever of the two events comes
/// first, the popover counts as up if it is visible now or a focus-out has
/// only just hidden it.
pub fn tray_press(app: &AppHandle) {
    let Some(window) = main_window(app) else {
        return;
    };
    let just_hidden = BLUR_HIDDEN_AT
        .lock()
        .ok()
        .and_then(|at| *at)
        .is_some_and(|at| at.elapsed() < PRESS_BLUR);
    let up = window.is_visible().unwrap_or(false) || just_hidden;
    UP_AT_PRESS.store(up, Ordering::SeqCst);
}

/// The tray icon was released: opens the popover, or puts it away if it was up
/// when the icon was pressed (see [`tray_press`]).
pub fn tray_release(app: &AppHandle) {
    let Some(window) = main_window(app) else {
        return;
    };
    if !UP_AT_PRESS.swap(false, Ordering::SeqCst) {
        show(&window);
    } else if window.is_visible().unwrap_or(false) {
        hide(&window);
    }
}

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
    if is_kept() {
        save_kept(window.app_handle());
    }
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
    if !place_kept(window) {
        position_at_tray(window);
    }
    // Re-assert a clear window each open: some macOS builds repaint opaque
    // after a hide. The frosted layer behind the page is left alone. It was
    // once rebuilt here too, and a new one draws a frame or two before it
    // blurs, which on macOS 27 showed as a flicker on every open.
    let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
    #[cfg(target_os = "macos")]
    clear_macos_background(window);
    #[cfg(target_os = "linux")]
    {
        FOCUSED_SINCE_SHOWN.store(false, Ordering::SeqCst);
        POINTER_OVER.store(POINTER_UNKNOWN, Ordering::SeqCst);
        if let Ok(mut shown) = SHOWN_AT.lock() {
            *shown = Some(std::time::Instant::now());
        }
    }
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
    let Some(Ok(Some(rect))) = app.tray_by_id(crate::tray::ID).map(|tray| tray.rect()) else {
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
    let rect = app.tray_by_id(crate::tray::ID)?.rect().ok()??;
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
/// The panel's edge comes from the work area rather than the pointer: a panel
/// reserves its strip of the screen, so the work area is inset at the top
/// (GNOME) or the bottom (KDE, Cinnamon, most tiling bars), and the popover
/// hangs from that edge. Only an open that came from the tray, with the
/// pointer by that panel, is centred on the pointer; any other (Sajilo showing
/// itself at first launch, with the pointer anywhere) takes the right-hand
/// end of the panel, where trays sit.
///
/// Clamped to the work area so an icon near an edge cannot shove the window
/// off-screen.
#[cfg(target_os = "linux")]
fn center_under_cursor(window: &WebviewWindow) -> bool {
    let Ok(size) = window.outer_size() else {
        return false;
    };
    let cursor = window.cursor_position().ok();
    // The pointer picks the monitor, so a second screen with its own panel is
    // handled without special-casing.
    let monitor = cursor
        .and_then(|cursor| window.monitor_from_point(cursor.x, cursor.y).ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return false;
    };

    let screen_top = monitor.position().y;
    let screen_bottom = screen_top + i32::try_from(monitor.size().height).unwrap_or(i32::MAX);
    let area = monitor.work_area();
    let top = area.position.y;
    let bottom = top + i32::try_from(area.size.height).unwrap_or(i32::MAX);
    let width = i32::try_from(size.width).unwrap_or(i32::MAX);
    let height = i32::try_from(size.height).unwrap_or(i32::MAX);
    let leftmost = area.position.x;
    let rightmost =
        (leftmost + i32::try_from(area.size.width).unwrap_or(i32::MAX) - width).max(leftmost);

    #[allow(clippy::cast_possible_truncation)]
    let pointer = cursor.map(|cursor| (cursor.x.round() as i32, cursor.y.round() as i32));
    let (inset_top, inset_bottom) = (top - screen_top, screen_bottom - bottom);
    let panel_at_bottom = match inset_bottom.cmp(&inset_top) {
        std::cmp::Ordering::Greater => true,
        std::cmp::Ordering::Less => false,
        // No panel reserves space (one that hides itself): the pointer's
        // half of the screen is the best guess left.
        std::cmp::Ordering::Equal => pointer.is_some_and(|(_, y)| y > top + (bottom - top) / 2),
    };
    let y = if panel_at_bottom {
        (bottom - height).max(top)
    } else {
        top
    };

    // By the panel: within a tray menu's reach of its edge.
    let reach = 160 * i32::try_from(monitor.scale_factor().ceil() as i64).unwrap_or(1);
    let from_tray = pointer.is_some_and(|(_, py)| {
        if panel_at_bottom {
            py >= bottom - reach
        } else {
            py <= top + reach
        }
    });
    let x = match pointer {
        Some((px, _)) if from_tray => (px - width / 2).clamp(leftmost, rightmost),
        _ => rightmost,
    };

    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .is_ok()
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

/// Dismiss on blur, the way a menu-bar popover is expected to behave, unless
/// it is kept open (see [`set_kept`]).
///
/// Set `SAJILO_NO_BLUR_HIDE=1` to keep the window up when it loses focus: with
/// devtools open, clicking into the inspector blurs the popover and would
/// otherwise dismiss the thing being inspected.
///
/// Linux needs more than a focus-out. GNOME has been seen to drop keyboard
/// focus from an undecorated, always-on-top, skip-taskbar popover with no
/// interaction at all, and dismissing on that made the app look like it
/// opened to nothing. But never dismissing on Linux left people with a window
/// they could not get rid of by clicking elsewhere, which is how every other
/// popover closes. So there a focus-out counts only when it looks like a
/// click away: see [`click_away_on_linux`].
pub fn hide_on_blur(window: &WebviewWindow, focused: bool) {
    // Counted even while kept open, so a popover unpinned later knows it has
    // had focus and a click away closes it straight away.
    #[cfg(target_os = "linux")]
    if focused {
        FOCUSED_SINCE_SHOWN.store(true, Ordering::SeqCst);
    }
    if is_kept() || std::env::var_os("SAJILO_NO_BLUR_HIDE").is_some() {
        return;
    }

    #[cfg(target_os = "linux")]
    click_away_on_linux(window, focused);

    #[cfg(not(target_os = "linux"))]
    {
        if focused || PINNED.load(Ordering::SeqCst) {
            return;
        }
        if let Ok(mut at) = BLUR_HIDDEN_AT.lock() {
            *at = Some(std::time::Instant::now());
        }
        hide(window);
    }
}

/// How long a focus-out has to last before it counts, so a compositor's
/// flicker of focus that snaps straight back is not a click away.
#[cfg(target_os = "linux")]
const BLUR_SETTLE: std::time::Duration = std::time::Duration::from_millis(250);

/// How soon after opening a focus-out is ignored: the open itself can bounce
/// focus while the window maps.
#[cfg(target_os = "linux")]
const OPEN_GRACE: std::time::Duration = std::time::Duration::from_millis(400);

/// A focus-out this close to the pointer leaving the popover, either way
/// round, was the pointer's doing: the desktop moves focus to whatever the
/// mouse is over. A click away comes later, once the pointer has reached what
/// it clicks.
#[cfg(target_os = "linux")]
const HOVER_FOCUS: std::time::Duration = std::time::Duration::from_millis(120);

/// How often, on X11, a popover that lost focus checks for a click outside it.
#[cfg(target_os = "linux")]
const CLICK_POLL: std::time::Duration = std::time::Duration::from_millis(25);

/// When the page last saw the pointer leave the popover, and when the popover
/// last lost focus; see [`HOVER_FOCUS`].
#[cfg(target_os = "linux")]
static POINTER_LEFT_AT: std::sync::Mutex<Option<std::time::Instant>> = std::sync::Mutex::new(None);
#[cfg(target_os = "linux")]
static FOCUS_LOST_AT: std::sync::Mutex<Option<std::time::Instant>> = std::sync::Mutex::new(None);

/// Counts focus changes, so a watch started by an older focus-out stops once a
/// newer one has taken over.
#[cfg(target_os = "linux")]
static BLUR_WATCH: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Hides the popover once the user clicks somewhere else.
///
/// A focus-out alone is not enough on Linux. GNOME has been seen to take focus
/// away with nobody touching anything, and a desktop that moves focus with the
/// mouse (Cinnamon's "sloppy" focus, sway and Hyprland by default) takes it
/// the moment the pointer is over another window. Closing on those made the
/// popover vanish while someone was only moving the mouse. So a focus-out only
/// starts a watch, and the popover must have had focus since it opened and
/// been up a moment.
///
/// - **On X11** the watch asks X which mouse buttons are down. The popover
///   hides when one is pressed with the pointer outside it: the click that took
///   focus, or on a focus-follows-mouse desktop, a later click anywhere. It
///   watches until the popover has focus again or is put away.
/// - **On Wayland** no app can see a click outside its own windows. The watch
///   waits for the focus to stay gone, then hides unless the pointer is over
///   the popover or the focus-out came with the pointer leaving it
///   ([`HOVER_FOCUS`]).
#[cfg(target_os = "linux")]
fn click_away_on_linux(window: &WebviewWindow, focused: bool) {
    let watch = BLUR_WATCH.fetch_add(1, Ordering::SeqCst) + 1;
    if focused {
        FOCUSED_SINCE_SHOWN.store(true, Ordering::SeqCst);
        return;
    }
    if let Ok(mut lost) = FOCUS_LOST_AT.lock() {
        *lost = Some(std::time::Instant::now());
    }
    let settled = SHOWN_AT
        .lock()
        .ok()
        .and_then(|shown| *shown)
        .is_some_and(|shown| shown.elapsed() >= OPEN_GRACE);
    if PINNED.load(Ordering::SeqCst) || !FOCUSED_SINCE_SHOWN.load(Ordering::SeqCst) || !settled {
        return;
    }

    let window = window.clone();
    if on_x11() {
        std::thread::spawn(move || watch_for_click_away(&window, watch));
        return;
    }
    tauri::async_runtime::spawn(async move {
        let pause = tauri::async_runtime::spawn_blocking(|| std::thread::sleep(BLUR_SETTLE));
        if pause.await.is_err() {
            return;
        }
        let target = window.clone();
        let _ = window.run_on_main_thread(move || {
            if still_watching(&target, watch) && !pointer_inside(&target) && !hover_took_focus() {
                hide_on_click_away(&target);
            }
        });
    });
}

/// The X11 watch: see [`click_away_on_linux`]. Runs on its own thread and
/// asks the main thread, where GTK lives, every [`CLICK_POLL`].
#[cfg(target_os = "linux")]
fn watch_for_click_away(window: &WebviewWindow, watch: u64) {
    loop {
        std::thread::sleep(CLICK_POLL);
        let (done_tx, done_rx) = std::sync::mpsc::sync_channel(1);
        let target = window.clone();
        let asked = window.run_on_main_thread(move || {
            let done = if !still_watching(&target, watch) {
                true
            } else if mouse_button_down() && !pointer_inside(&target) {
                hide_on_click_away(&target);
                true
            } else {
                false
            };
            let _ = done_tx.send(done);
        });
        if asked.is_err() || done_rx.recv().unwrap_or(true) {
            return;
        }
    }
}

/// Whether the focus-out that started `watch` still stands: the popover is up
/// and unfocused, nothing newer has happened, and nothing holds it open.
#[cfg(target_os = "linux")]
fn still_watching(window: &WebviewWindow, watch: u64) -> bool {
    BLUR_WATCH.load(Ordering::SeqCst) == watch
        && window.is_visible().unwrap_or(false)
        && !window.is_focused().unwrap_or(true)
        && !PINNED.load(Ordering::SeqCst)
        && !is_kept()
}

/// Whether the last focus-out came with the pointer leaving the popover; see
/// [`HOVER_FOCUS`].
#[cfg(target_os = "linux")]
fn hover_took_focus() -> bool {
    let at =
        |stamp: &std::sync::Mutex<Option<std::time::Instant>>| stamp.lock().ok().and_then(|at| *at);
    let (Some(left), Some(lost)) = (at(&POINTER_LEFT_AT), at(&FOCUS_LOST_AT)) else {
        return false;
    };
    let apart = if left > lost {
        left - lost
    } else {
        lost - left
    };
    apart < HOVER_FOCUS
}

/// Whether a mouse button is down anywhere on screen, which X11 can answer
/// for any window's pointer. Must run on the main thread.
#[cfg(target_os = "linux")]
fn mouse_button_down() -> bool {
    use gdk::ModifierType;
    use gdk::prelude::*;

    let Some(display) = gdk::Display::default() else {
        return false;
    };
    let Some(pointer) = display.default_seat().and_then(|seat| seat.pointer()) else {
        return false;
    };
    let Some(root) = display.default_screen().root_window() else {
        return false;
    };
    let (_, _, _, mask) = root.device_position(&pointer);
    mask.intersects(
        ModifierType::BUTTON1_MASK | ModifierType::BUTTON2_MASK | ModifierType::BUTTON3_MASK,
    )
}

/// Hides after a click away, and notes when: that click may have been on the
/// tray icon, whose click then arrives to find the popover gone and must not
/// open it again (see [`tray_click_on_linux`]).
#[cfg(target_os = "linux")]
fn hide_on_click_away(window: &WebviewWindow) {
    if let Ok(mut at) = BLUR_HIDDEN_AT.lock() {
        *at = Some(std::time::Instant::now());
    }
    hide(window);
}

/// How long after a click away a click on the tray icon is the same click.
/// The panel sends it on the button's release, which comes after the press
/// that hid the popover.
#[cfg(target_os = "linux")]
const TRAY_AFTER_CLICK_AWAY: std::time::Duration = std::time::Duration::from_millis(500);

/// A left click on the tray icon: opens the popover, or puts it away. When the
/// press on the icon has just closed it as a click away, the click is that
/// same close, not a new open.
#[cfg(target_os = "linux")]
pub fn tray_click_on_linux(app: &AppHandle) {
    let Some(window) = main_window(app) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        hide(&window);
        return;
    }
    let just_closed = BLUR_HIDDEN_AT
        .lock()
        .ok()
        .and_then(|at| *at)
        .is_some_and(|at| at.elapsed() < TRAY_AFTER_CLICK_AWAY);
    if !just_closed {
        show(&window);
    }
}

/// Whether the pointer is over the popover.
///
/// The page's own report comes first: it is exact everywhere. Before the page
/// has seen the pointer enter or leave, X11 can still be asked where the
/// pointer is. A Wayland session cannot be asked, and there an unknown pointer
/// counts as away, so a click elsewhere still closes a popover that was never
/// hovered; on X11 a failed read counts as inside, so it never dismisses.
#[cfg(target_os = "linux")]
fn pointer_inside(window: &WebviewWindow) -> bool {
    match POINTER_OVER.load(Ordering::SeqCst) {
        POINTER_IN => return true,
        POINTER_OUT => return false,
        _ => {}
    }
    if !on_x11() {
        return false;
    }
    let (Ok(cursor), Ok(origin), Ok(size)) = (
        window.cursor_position(),
        window.outer_position(),
        window.outer_size(),
    ) else {
        return true;
    };
    let left = f64::from(origin.x);
    let top = f64::from(origin.y);
    cursor.x >= left
        && cursor.x < left + f64::from(size.width)
        && cursor.y >= top
        && cursor.y < top + f64::from(size.height)
}

/// Whether GTK is drawing through X11 (native, or XWayland as
/// `prefer_x11_backend` asks for), where the pointer can be read anywhere on
/// screen. On native Wayland it cannot.
#[cfg(target_os = "linux")]
fn on_x11() -> bool {
    std::env::var("GDK_BACKEND").map_or_else(
        |_| std::env::var_os("WAYLAND_DISPLAY").is_none(),
        |backend| backend.split(',').next() == Some("x11"),
    )
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
/// `NSVisualEffectView` behind the web content. Call this once, from setup:
/// the effect view survives a hide, and each show only re-clears the window
/// (see [`show_now`]).
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
