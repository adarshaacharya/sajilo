//! The tray icon: Sajilo's only permanent presence on screen.

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

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().ok_or_else(|| {
            tauri::Error::AssetNotFound("no default window icon to use for the tray".into())
        })?)
        // A template icon is recoloured by macOS to match the menu bar, so it
        // stays legible in both light and dark.
        .icon_as_template(true)
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

    Ok(())
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
