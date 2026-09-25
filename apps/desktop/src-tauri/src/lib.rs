//! The Sajilo desktop shell.
//!
//! M4 is deliberately only a shell: a tray icon, a popover that opens and
//! dismisses, and nothing product-specific. The screens arrive in M6.

pub mod article_dates;
pub mod background_refresh;
pub mod commands;
pub mod db;
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

/// Runs the GTK shell on X11 (XWayland) rather than as a native Wayland client.
///
/// Wayland deliberately denies a client any say over its own placement, and it
/// ignores GTK's skip-taskbar hint. For a tray popover both matter: without
/// them the window lands wherever the compositor likes — centred on GNOME,
/// nowhere near the tray icon it belongs to — and it picks up a dock entry that
/// `skipTaskbar: true` was supposed to prevent. Under XWayland the same binary
/// anchors itself beside the tray and sets `_NET_WM_STATE_SKIP_TASKBAR`, so the
/// popover behaves like the menu-bar utility it is on every desktop.
///
/// Respects an explicit `GDK_BACKEND` so anyone wanting the native Wayland
/// surface (and the centred, docked window that comes with it) can still ask.
/// And only asks for X11 where there is one: a Wayland session with XWayland
/// turned off (common on sway and Hyprland) has no `DISPLAY`, and forcing X11
/// there made GTK fail to start at all. Native Wayland places the popover
/// less well, but it opens.
/// Must run before GTK initialises, hence the top of [`run`].
#[cfg(target_os = "linux")]
fn prefer_x11_backend() {
    if std::env::var_os("GDK_BACKEND").is_some() || std::env::var_os("DISPLAY").is_none() {
        return;
    }
    // SAFETY: single-threaded — this is the first statement of `run`, which is
    // called straight from `main`, before Tauri or GTK spawns any thread.
    unsafe { std::env::set_var("GDK_BACKEND", "x11") };
}

/// Lets WebKitGTK play HLS (`.m3u8`) radio streams, which BBC Nepali uses.
///
/// Since WebKitGTK 2.38.4 native HLS playback is off unless this is set, so on
/// every Linux build that station failed while it played on macOS, where the
/// system player handles HLS itself. Respects an explicit value like
/// [`prefer_x11_backend`]. Must run before the webview starts.
#[cfg(target_os = "linux")]
fn enable_hls_playback() {
    const KEY: &str = "WEBKIT_GST_ENABLE_HLS_SUPPORT";
    if std::env::var_os(KEY).is_some() {
        return;
    }
    // SAFETY: as in `prefer_x11_backend` — still before any thread exists.
    unsafe { std::env::set_var(KEY, "1") };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[allow(clippy::too_many_lines)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        prefer_x11_backend();
        enable_hls_playback();
    }

    let mut builder = tauri::Builder::default();

    // One Sajilo at a time, registered first so a second launch exits before
    // it builds anything. Opening Sajilo again from the app menu used to start
    // a second, hidden copy, which looked like nothing happening; now it
    // brings up the window of the one already running.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let has = |flag: &str| args.iter().any(|arg| arg == flag);
            if has(system::autostart::LOGIN_FLAG) {
                return;
            }
            if has(system::autostart::TOGGLE_FLAG) {
                window::toggle(app);
            } else if let Some(main) = window::main_window(app) {
                window::show(&main);
            }
        }));
    }

    builder = builder
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
            Some(vec![system::autostart::LOGIN_FLAG]),
        ));
        builder = register_updater(builder);
    }

    builder
        .setup(|app| {
            // Create and migrate the single local database before any tray or
            // notification code reads user-owned state.
            db::open(app.handle()).map_err(std::io::Error::other)?;
            // Menu-bar utility by default: no Dock icon, no taskbar entry.
            app.manage(commands::bazar::BazarCache::default());
            app.manage(commands::stocks::StocksCache::default());
            app.manage(commands::ipos::IposCache::default());
            app.manage(commands::dividends::DividendsCache::default());
            app.manage(commands::mutual_funds::MutualFundsCache::default());
            app.manage(commands::nepse_intraday::NepseIntradayCache::default());
            app.manage(commands::rashifal::RashifalCache::default());
            app.manage(commands::radio::RadioCache::default());
            app.manage(commands::weather::WeatherCache::default());
            app.manage(commands::forex::ForexCache::default());
            app.manage(commands::news::NewsCache::default());
            app.manage(commands::announcement::AnnouncementCache::default());
            app.manage(commands::focus::FocusRuntime::default());
            app.manage(commands::reminder_card::ReminderQueue::default());
            system::dock::set_hidden(app.handle(), true);
            tray::build(app.handle())?;
            // Clear chrome + popover vibrancy so the web UI sits on frosted glass
            // (Swift Patro) and CSS border-radius isn't painted on a square plate.
            if let Some(main) = app.get_webview_window(window::MAIN) {
                let _ = main.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
                #[cfg(target_os = "macos")]
                window::polish_macos_chrome(&main);
                #[cfg(target_os = "windows")]
                window::fit_windows_shadow(&main);
            }
            if let Some(update) = app.get_webview_window(window::UPDATE) {
                let _ = update.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
                #[cfg(target_os = "macos")]
                window::polish_macos_chrome(&update);
                #[cfg(target_os = "windows")]
                window::fit_windows_shadow(&update);
            }
            // Delivers anything missed while the app was closed, then sleeps
            // until the next reminder rather than polling.
            // Before the scheduler starts, so its first delivery already
            // knows: a new install gets a few quiet minutes for setup.
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            if system::autostart::is_first_run(app.handle()) {
                commands::notify::hold_for_first_run();
            }
            commands::notify::spawn_scheduler(app.handle().clone());
            background_refresh::spawn(app.handle().clone());
            commands::focus::spawn(app.handle().clone());

            // Opened on purpose, Sajilo shows itself; started at login, it
            // waits in the tray. Before this, only the very first launch
            // showed the window, so on a desktop whose tray icon was missing
            // or unnoticed, every later launch appeared to do nothing.
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let first_run = system::autostart::apply_first_run_default(app.handle());
                if first_run {
                    // Existing installs recorded their first run long ago, so
                    // only a new one is offered the setup card.
                    let _ = db::set_json(
                        app.handle(),
                        prefs::SETUP_CARD_PENDING,
                        &serde_json::Value::Bool(true),
                    );
                    // New installs start on 1 2 3, which most people read
                    // fastest. Stored rather than made the default, so anyone
                    // already on the old default (१ २ ३) keeps what they see.
                    let _ = db::set_json(
                        app.handle(),
                        prefs::NUMERAL_STYLE,
                        &serde_json::Value::String("latin".to_owned()),
                    );
                    // The tray was drawn before this was stored.
                    tray::refresh_title(app.handle());
                }
                system::autostart::refresh_login_item(app.handle());
                if (first_run || !system::autostart::launched_at_login())
                    && let Some(main) = window::main_window(app.handle())
                {
                    window::show(&main);
                }
            }

            // Windows hides new tray icons behind the ^ arrow, so tell the user
            // where Sajilo went. Once per install; see `system::tray_pin`.
            #[cfg(target_os = "windows")]
            system::tray_pin::notify_once(app.handle());

            Ok(())
        })
        .on_window_event(|window, event| match event {
            // The popover is hidden, never closed — closing would destroy the
            // webview and with it every loaded feed and scroll position.
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                if window.label() == window::MAIN {
                    if let Some(main) = window.get_webview_window(window::MAIN) {
                        window::hide(&main);
                    }
                } else {
                    let _ = window.hide();
                }
            }
            WindowEvent::Focused(focused) if window.label() == window::MAIN => {
                if let Some(main) = window.get_webview_window(window::MAIN) {
                    window::hide_on_blur(&main, *focused);
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::bazar::get_bazar,
            commands::stocks::get_stocks,
            commands::portfolio::stock_portfolio,
            commands::portfolio::estimate_stock_trade,
            commands::portfolio::save_stock_transaction,
            commands::portfolio::delete_stock_transaction,
            commands::ipos::get_ipos,
            commands::dividends::get_dividends,
            commands::mutual_funds::get_mutual_funds,
            commands::sips::sip_statuses,
            commands::sips::set_sip,
            commands::sips::remove_sip,
            commands::sips::mark_sip_paid,
            commands::sips::remind_sip_tomorrow,
            commands::nepse_intraday::get_nepse_intraday,
            commands::rashifal::get_rashifal,
            commands::radio::get_stations,
            commands::radio::station_stream,
            commands::weather::get_weather,
            commands::weather::list_places,
            commands::forex::get_forex,
            commands::news::get_news,
            commands::news::news_sources,
            commands::announcement::get_announcement,
            commands::announcement::dismiss_announcement,
            commands::telemetry::usage_insights_enabled,
            commands::telemetry::set_usage_insights_enabled,
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
            commands::plans::plan_days,
            commands::plans::save_plan,
            commands::plans::delete_plan,
            commands::focus::focus_snapshot,
            commands::focus::set_focus_settings,
            commands::focus::enable_recommended_breaks,
            commands::focus::disable_breaks,
            commands::focus::log_focus_water,
            commands::focus::pause_focus,
            commands::focus::finish_focus_break,
            commands::focus::preview_focus_break,
            commands::keeper::keeper_snapshot,
            commands::keeper::resolve_keeper_date,
            commands::keeper::save_keeper_person,
            commands::keeper::delete_keeper_person,
            commands::keeper::save_keeper_item,
            commands::keeper::delete_keeper_item,
            commands::keeper::save_keeper_record,
            commands::keeper::advance_keeper_record,
            commands::keeper::complete_keeper_item,
            commands::attachments::list_keeper_attachments,
            commands::attachments::summarize_keeper_attachments,
            commands::attachments::add_keeper_attachments_from_paths,
            commands::attachments::add_keeper_attachment_bytes,
            commands::attachments::get_keeper_attachment,
            commands::attachments::delete_keeper_attachment,
            commands::attachments::rotate_keeper_attachment,
            commands::attachments::export_keeper_attachment,
            commands::attachments::discard_keeper_attachments,
            commands::attachments::open_keeper_viewer,
            commands::keeper::delete_keeper_record,
            commands::storage::get_setting,
            commands::storage::set_setting,
            commands::storage::delete_setting,
            commands::external::open_external_url,
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
            commands::reminder_card::current_reminder,
            commands::reminder_card::dismiss_reminder,
            commands::reminder_card::preview_reminder_card,
            commands::notify::get_notification_options,
            commands::notify::set_notification_options,
            system::autostart::is_autostart_enabled,
            system::autostart::set_autostart,
            system::autostart::set_dock_icon_visible,
            system::autostart::is_dock_icon_visible,
            commands::tray::refresh_tray,
            commands::tray::quit_app,
            commands::tray::hide_popover,
            commands::tray::set_tray_update,
            commands::tray::pin_popover,
            updater_enabled,
            system::update_restart::update_installed,
            system::update_restart::set_audio_playing,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Sajilo")
        .run(|app, event| {
            // macOS never starts a second copy: opening Sajilo again from
            // Finder, Spotlight or Launchpad sends the running one a reopen
            // instead, which it answers the way the other platforms answer a
            // second launch (see the single-instance plugin above).
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event
                && let Some(main) = window::main_window(app)
            {
                window::show(&main);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
