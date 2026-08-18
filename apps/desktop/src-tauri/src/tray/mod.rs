//! The tray icon: Sajilo's only permanent presence on screen.

pub mod icon;
pub mod title;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

use crate::window;

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
    let quit = MenuItem::with_id(app, "quit", "Quit Sajilo", true, Some("CmdOrCtrl+Q"))?;
    let menu = Menu::with_items(
        app,
        &[&settings, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    #[cfg_attr(target_os = "macos", allow(unused_mut))]
    let mut builder = TrayIconBuilder::with_id("main");

    // ponytail: macOS carries the date as the tray *title*, like the Swift app
    // did, so it needs no glyph — the app icon is a filled square and a template
    // render of it is an unreadable blob. Every other platform draws the day
    // number into the icon (see `refresh_title`), so it starts from the app icon.
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
        // Left click toggles the popover; the menu is the right-click affordance.
        .show_menu_on_left_click(false)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
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

/// Redraws the tray label from the current date and preferences.
pub fn refresh_title(app: &AppHandle) {
    let Some(tray) = app.tray_by_id("main") else {
        return;
    };
    let Some(date) = title::today() else {
        return;
    };

    let (format, numerals, custom, show_time) = crate::prefs::tray_preferences(app);
    let mut label = title::title(date, format, numerals, custom);
    if show_time {
        label = format!(
            "{label} · {}",
            title::clock(sajilo_core::nepal_time::now(), numerals)
        );
    }

    // Only macOS renders text beside a tray icon.
    #[cfg(target_os = "macos")]
    let _ = tray.set_title(Some(&label));

    // Elsewhere the day number is drawn into the icon itself, since the icon is
    // all the tray gives us. A failed render keeps the static icon: a tray with
    // no date beats a tray with no icon.
    #[cfg(not(target_os = "macos"))]
    if let Some(pixels) = icon::day_icon(date.day, numerals) {
        let image = tauri::image::Image::new_owned(pixels, icon::size(), icon::size());
        let _ = tray.set_icon(Some(image));
        // The day number alone has no month or year, so the full label stays
        // reachable on hover.
        let _ = tray.set_icon_as_template(false);
    }

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
