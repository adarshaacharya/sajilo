//! The tray icon: Sajilo's only permanent presence on screen.

pub mod icon;
pub mod title;

use sajilo_core::NepaliDate;
use sajilo_core::numerals::NumeralStyle;
#[cfg(not(target_os = "linux"))]
use tauri::menu::PredefinedMenuItem;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::window;

#[cfg(target_os = "linux")]
const OPEN_LABEL: &str = "Open Sajilo";
#[cfg(target_os = "linux")]
const HIDE_LABEL: &str = "Hide Sajilo";

/// The Linux menu's single item, kept so its label can track the popover.
#[cfg(target_os = "linux")]
struct PopoverItem(MenuItem<tauri::Wry>);

/// Names what the menu item will actually do next.
///
/// The item both opens and dismisses the popover, because on Linux it stands in
/// for the tray click the platform never delivers. A fixed "Open Sajilo" would
/// therefore be wrong half the time — it would hide a popover that is already
/// up.
///
/// Takes the state being moved *into* rather than reading it back off the
/// window: GTK maps and unmaps asynchronously, so `is_visible` still reports the
/// previous state when called right after `show`/`hide`, which left the label a
/// step behind and naming the wrong action.
#[cfg(target_os = "linux")]
pub fn set_popover_shown(app: &AppHandle, shown: bool) {
    use tauri::Manager as _;

    let Some(item) = app.try_state::<PopoverItem>() else {
        return;
    };
    let _ = item.0.set_text(if shown { HIDE_LABEL } else { OPEN_LABEL });
}

/// The date row at the top of the tray menu, kept so `refresh_title` can move
/// it forward with the day.
///
/// macOS and Windows only: Linux's menu is a single toggle item (see `build`),
/// so there is no date row to move there — the date rides the appindicator
/// label instead.
struct DateItem(MenuItem<Wry>);

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(not(target_os = "linux"))]
    let date = MenuItem::with_id(
        app,
        "open",
        label(app).unwrap_or_else(|| "Sajilo".to_owned()),
        true,
        None::<&str>,
    )?;
    #[cfg(not(target_os = "linux"))]
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
    #[cfg(not(target_os = "linux"))]
    let quit = MenuItem::with_id(app, "quit", "Quit Sajilo", true, Some("CmdOrCtrl+Q"))?;

    // Linux gets a one-item menu that opens the app, and nothing else.
    //
    // `show_menu_on_left_click(false)` is documented as unsupported there, and
    // the libappindicator item exposes no `Activate` method, so a
    // StatusNotifier host (GNOME's AppIndicator extension) has nothing to call
    // and opens this menu on *every* click — left included, which is why the
    // `TrayIconEvent::Click` branch below never fires on Linux. The menu is
    // therefore the only route to the popover, and the shortest such route is a
    // single item that opens it: Settings and Quit are already in the popover's
    // own header, so repeating them here only puts more between the tray icon
    // and the app. Escape dismisses the popover (Linux skips blur-to-dismiss).
    //
    // macOS and Windows keep the full menu: there, left click toggles the
    // popover and this menu is the right-click affordance.
    #[cfg(target_os = "linux")]
    let open = MenuItem::with_id(app, "open", OPEN_LABEL, true, None::<&str>)?;

    #[cfg(target_os = "linux")]
    let menu = Menu::with_items(app, &[&open])?;

    // Kept so the label can follow the popover; see `set_popover_shown`.
    #[cfg(target_os = "linux")]
    app.manage(PopoverItem(open));
    #[cfg(not(target_os = "linux"))]
    let menu = Menu::with_items(
        app,
        &[
            &date,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    #[cfg(not(target_os = "linux"))]
    app.manage(DateItem(date));

    #[cfg_attr(target_os = "macos", allow(unused_mut))]
    let mut builder = TrayIconBuilder::with_id("main");

    // macOS carries the date as the tray *title*, like the Swift app did, so it
    // needs no glyph — the app icon is a filled square and a template render of
    // it is an unreadable blob. Elsewhere the tray starts from the app icon:
    // Windows then swaps in the Nepal flag, and Linux keeps it as-is, since
    // libayatana-appindicator refuses to show a label without one.
    #[cfg(not(target_os = "macos"))]
    {
        builder = builder
            .icon(app.default_window_icon().cloned().ok_or_else(|| {
                tauri::Error::AssetNotFound("no default window icon to use for the tray".into())
            })?)
            .icon_as_template(true);
    }

    builder
        .tooltip("Sajilo")
        // Left click toggles the popover; the menu is the right-click
        // affordance. Linux ignores this — appindicator opens the menu on any
        // click — which is the other half of why the menu leads with the date.
        .show_menu_on_left_click(false)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            // The date row on macOS and Windows; on Linux the single menu item,
            // standing in for the tray click that platform never delivers.
            "open" => window::toggle(app),
            "settings" => open_settings(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // The positioner needs every tray event to keep track of where the
            // icon actually is.
            tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);

            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                window::toggle(tray.app_handle());
            }
        })
        .build(app)?;

    refresh_title(app);
    spawn_midnight_rollover(app.clone());
    Ok(())
}

/// Today's date, the numeral style to draw it in, and the text the tray
/// carries: the date in the configured format, plus the clock when that
/// preference is on. `None` only when today falls outside the bundled calendar
/// range.
fn today(app: &AppHandle) -> Option<(NepaliDate, NumeralStyle, String)> {
    let date = title::today()?;
    let (format, numerals, custom, show_time) = crate::prefs::tray_preferences(app);
    let mut label = title::title(date, format, numerals, custom);
    if show_time {
        label = format!(
            "{label} · {}",
            title::clock(sajilo_core::nepal_time::now(), numerals)
        );
    }
    Some((date, numerals, label))
}

/// The tray menu's date row, for the one call that needs the text alone.
fn label(app: &AppHandle) -> Option<String> {
    today(app).map(|(.., label)| label)
}

/// Redraws the tray label from the current date and preferences.
pub fn refresh_title(app: &AppHandle) {
    let Some(tray) = app.tray_by_id("main") else {
        return;
    };
    let Some((date, numerals, label)) = today(app) else {
        return;
    };
    // The full date is conveyed in the native title/menu/tooltip. Windows'
    // visible tray glyph is a static Nepal flag, so it has no date fields.
    let _ = (date, numerals);

    // The menu's date row moves with the day where it exists; Linux has no such
    // row (its menu is the toggle item) and carries the date in the label below.
    if let Some(item) = app.try_state::<DateItem>() {
        let _ = item.0.set_text(&label);
    }

    // macOS renders text beside the tray icon natively; Linux does the same
    // through the libayatana-appindicator label, given a StatusNotifier host
    // such as GNOME's AppIndicator extension. Both carry the full date.
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    let _ = tray.set_title(Some(&label));

    // Windows has no tray title, so use a crisp Nepal flag that remains
    // recognisable at its tiny native size. The full date stays in the tooltip
    // and the first tray-menu item.
    #[cfg(target_os = "windows")]
    if let Some(pixels) = icon::nepal_flag_icon() {
        let image = tauri::image::Image::new_owned(pixels, icon::size(), icon::size());
        let _ = tray.set_icon(Some(image));
        let _ = tray.set_icon_as_template(false);
    }

    // A no-op on Linux — `tray-icon`'s GTK backend implements `set_tooltip` as
    // an empty `Ok(())`, which is why the date row above exists.
    let _ = tray.set_tooltip(Some(&label));
}

/// Redraws at Kathmandu midnight — or every minute, while the tray also shows
/// the clock.
///
/// Sleeps until the next tick rather than polling, and recomputes the wait
/// each time so it self-corrects after a laptop wakes from sleep having missed
/// one entirely, and so switching the clock on or off is picked up on the very
/// next tick rather than needing a restart.
fn spawn_midnight_rollover(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let now = sajilo_core::nepal_time::now();
            let (.., show_time) = crate::prefs::tray_preferences(&app);
            let wait = if show_time {
                title::seconds_until_next_minute(now)
            } else {
                title::seconds_until_nepal_midnight(now)
            };
            // Tauri's own runtime, so the app does not carry a second one.
            tauri::async_runtime::spawn_blocking(move || {
                std::thread::sleep(std::time::Duration::from_secs(wait as u64));
            })
            .await
            .ok();
            refresh_title(&app);
        }
    });
}

/// Opens the popover and asks the frontend to route to Settings. The route lives
/// in the web layer, so this is a message rather than a navigation.
fn open_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(window::MAIN) {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("sajilo://navigate", "/settings");
    }
}
