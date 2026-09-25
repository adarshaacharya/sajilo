//! Helping Windows users find the tray icon.
//!
//! Windows 11 puts every newly installed tray icon behind the ^ overflow
//! arrow, and deliberately offers no API for an app to move itself out. So a
//! fresh install of Sajilo is invisible until someone goes looking. The
//! frontend shows a one-time card explaining how to drag it out; this sends a
//! one-time notification as well, because the card only helps someone who has
//! already opened the popover.

use crate::{
    db,
    prefs::{TRAY_PIN_NOTIFIED, TRAY_PIN_TIP_DISMISSED},
};
use tauri::{AppHandle, Wry};
use tauri_plugin_notification::NotificationExt;

/// Sends the "Sajilo is running" notification, at most once per install.
///
/// Skipped once the card has been dismissed: someone who read it does not need
/// the same advice again. Keyed on its own flag rather than on first run, so
/// people who installed before this existed — the ones who reported the
/// hidden icon — get it once too.
///
/// Compiled everywhere, called only on Windows, so the checks that run on a
/// Mac still type-check it.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn notify_once(app: &AppHandle<Wry>) {
    let flag = |key| db::get_json(app, key).ok().flatten().is_some();
    if flag(TRAY_PIN_NOTIFIED) || flag(TRAY_PIN_TIP_DISMISSED) {
        return;
    }

    let (title, body) = match crate::prefs::language(app) {
        sajilo_core::focus::Language::Ne => (
            "सजिलो चलिरहेको छ",
            "टास्कबारको ^ तीरभित्र खोज्नुहोस्, अनि झण्डालाई घडीको छेउमा तान्नुहोस्।",
        ),
        sajilo_core::focus::Language::En => (
            "Sajilo is running",
            "Find it under the ^ arrow on your taskbar, then drag the flag next to the clock.",
        ),
    };
    let result = app.notification().builder().title(title).body(body).show();

    // Recorded only on success, so a failed delivery is retried next launch
    // rather than silently marked done.
    if result.is_ok() {
        let _ = db::set_json(app, TRAY_PIN_NOTIFIED, &serde_json::Value::Bool(true));
    }
}
