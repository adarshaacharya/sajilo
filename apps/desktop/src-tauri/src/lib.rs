//! The Sajilo desktop shell.
//!
//! M4 is deliberately only a shell: a tray icon, a popover that opens and
//! dismisses, and nothing product-specific. The screens arrive in M6.

pub mod commands;
pub mod feed;
pub mod prefs;
pub mod system;
pub mod tray;
pub mod window;

use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_positioner::init());

    // Autostart is desktop-only: a platform with no login items has nothing to
    // register.
    //
    // The updater is deliberately *not* registered yet. It refuses to
    // initialise without a `plugins.updater` block carrying a real public key,
    // and that keypair is generated in M9 — writing a placeholder key here
    // would only fake a readiness the app does not have.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));
    }

    builder
        .setup(|app| {
            // Menu-bar utility by default: no Dock icon, no taskbar entry.
            app.manage(commands::bazar::BazarCache::default());
            app.manage(commands::rashifal::RashifalCache::default());
            app.manage(commands::radio::RadioCache::default());
            system::dock::set_hidden(app.handle(), true);
            tray::build(app.handle())?;
            // Delivers anything missed while the app was closed, then sleeps
            // until the next reminder rather than polling.
            commands::notify::spawn_scheduler(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // The popover is hidden, never closed — closing would destroy the
            // webview and with it every loaded feed and scroll position.
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Focused(focused) => {
                if let Some(main) = window.get_webview_window(window::MAIN) {
                    window::hide_on_blur(&main, *focused);
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::bazar::get_bazar,
            commands::rashifal::get_rashifal,
            commands::radio::get_stations,
            commands::radio::station_stream,
            commands::calendar::today,
            commands::calendar::month_grid,
            commands::calendar::shift_month,
            commands::calendar::bs_to_ad,
            commands::calendar::ad_to_bs,
            commands::calendar::events_for,
            commands::calendar::upcoming_events,
            commands::calendar::supported_range,
            commands::plans::list_plans,
            commands::plans::plans_for_day,
            commands::plans::save_plan,
            commands::plans::delete_plan,
            commands::tools::convert_land,
            commands::tools::land_breakdown,
            commands::tools::convert_weight,
            commands::tools::compute_vat,
            commands::tools::compute_interest,
            commands::tools::group_number,
            commands::backup::export_backup,
            commands::backup::import_backup,
            commands::backup::is_first_run,
            commands::backup::mark_launched,
            commands::notify::notification_permission,
            commands::notify::request_notification_permission,
            commands::notify::pending_notifications,
            commands::notify::get_notification_options,
            commands::notify::set_notification_options,
            system::autostart::is_autostart_enabled,
            system::autostart::set_autostart,
            system::autostart::set_dock_icon_visible,
            commands::tray::refresh_tray,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sajilo");
}
