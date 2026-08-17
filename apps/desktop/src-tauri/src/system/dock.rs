//! Sajilo lives in the menu bar, not the Dock.

/// `Accessory` keeps the app out of the Dock and the Cmd-Tab switcher, which is
/// what makes it read as a menu-bar utility rather than a window app the user
/// forgot to close.
///
/// Settings offers a toggle back to `Regular` for people who want the Dock icon,
/// so this is the default rather than a permanent decision.
#[cfg(target_os = "macos")]
pub fn set_hidden(app: &tauri::AppHandle, hidden: bool) {
    let policy = if hidden {
        tauri::ActivationPolicy::Accessory
    } else {
        tauri::ActivationPolicy::Regular
    };
    let _ = app.set_activation_policy(policy);
}

/// No-op elsewhere: `skipTaskbar` in `tauri.conf.json` already keeps the window
/// off the Windows taskbar and out of most Linux docks.
#[cfg(not(target_os = "macos"))]
pub fn set_hidden(_app: &tauri::AppHandle, _hidden: bool) {}
