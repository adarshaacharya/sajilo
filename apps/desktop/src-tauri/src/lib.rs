//! The Sajilo desktop shell.
//!
//! M4 is deliberately only a shell: a tray icon, a popover that opens and
//! dismisses, and nothing product-specific. The screens arrive in M6.

pub mod article_dates;
pub mod commands;
pub mod feed;
pub mod prefs;
pub mod system;
pub mod tray;
pub mod window;

use tauri::{Manager, WindowEvent};

/// Registers the updater plugin only when a real signing key was baked in at
/// build time (`SAJILO_UPDATER_PUBKEY`, set by `release-desktop.yml` once
/// `scripts/generate-updater-key.sh` has been run and the public half added to
/// CI secrets). Without it the plugin is left out entirely: a dev build or an
/// unsigned release has nothing to check with, and skipping registration is
/// how the Settings "check for updates" row knows to hide itself rather than
/// call a command that does not exist.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn register_updater(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    let Some(pubkey) = option_env!("SAJILO_UPDATER_PUBKEY") else {
        return builder;
    };
    // The pubkey itself isn't sensitive — it's also committed in
    // `tauri.conf.json`'s `plugins.updater.pubkey`, since the CLI needs its
    // own copy there to sign `latest.json` at build time. This env var is
    // what actually gates registration: its *absence* is what keeps the
    // updater plugin out of dev and unsigned builds entirely.
    builder.plugin(tauri_plugin_updater::Builder::new().pubkey(pubkey).build())
}

/// Whether this build was signed with a real updater key. The Settings screen
/// uses this to decide whether to show "check for updates" at all — calling
/// the updater plugin's JS API when it was never registered would just error.
#[tauri::command]
fn updater_enabled() -> bool {
    option_env!("SAJILO_UPDATER_PUBKEY").is_some()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_process::init());

    // Autostart is desktop-only: a platform with no login items has nothing to
    // register.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));
        builder = register_updater(builder);
    }

    builder
        .setup(|app| {
            // Menu-bar utility by default: no Dock icon, no taskbar entry.
            app.manage(commands::bazar::BazarCache::default());
            app.manage(commands::stocks::StocksCache::default());
            app.manage(commands::rashifal::RashifalCache::default());
            app.manage(commands::radio::RadioCache::default());
            app.manage(commands::weather::WeatherCache::default());
            app.manage(commands::forex::ForexCache::default());
            app.manage(commands::news::NewsCache::default());
            system::dock::set_hidden(app.handle(), true);
            tray::build(app.handle())?;
            // Clear chrome + popover vibrancy so the web UI sits on frosted glass
            // (Swift Patro) and CSS border-radius isn't painted on a square plate.
            if let Some(main) = app.get_webview_window(window::MAIN) {
                let _ = main.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
                #[cfg(target_os = "macos")]
                window::polish_macos_chrome(&main);
            }
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
            commands::stocks::get_stocks,
            commands::rashifal::get_rashifal,
            commands::radio::get_stations,
            commands::radio::station_stream,
            commands::weather::get_weather,
            commands::forex::get_forex,
            commands::news::get_news,
            commands::calendar::today,
            commands::calendar::month_grid,
            commands::calendar::shift_month,
            commands::calendar::bs_to_ad,
            commands::calendar::ad_to_bs,
            commands::calendar::events_for,
            commands::calendar::upcoming_events,
            commands::calendar::supported_range,
            commands::calendar::panchanga_for,
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
            system::autostart::is_dock_icon_visible,
            commands::tray::refresh_tray,
            commands::tray::quit_app,
            commands::tray::hide_popover,
            updater_enabled,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sajilo");
}
