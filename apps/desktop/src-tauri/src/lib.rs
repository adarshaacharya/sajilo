//! The Sajilo desktop shell.
//!
//! M4 is deliberately only a shell: a tray icon, a popover that opens and
//! dismisses, and nothing product-specific. The screens arrive in M6.

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
            system::dock::set_hidden(app.handle(), true);
            tray::build(app.handle())?;
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
        .run(tauri::generate_context!())
        .expect("error while running Sajilo");
}
