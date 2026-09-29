//! Sajilo's own button in GNOME's top bar: one click opens Sajilo.
//!
//! GNOME draws tray icons through its AppIndicator extension, which opens an
//! icon's menu on a single click and the app only on a double click, whatever
//! the app asks for (see `linux_host`). The only way to own the click is to own
//! the button, so Sajilo ships a small GNOME Shell extension
//! (`apps/gnome-extension`) and talks to it over D-Bus:
//!
//! - Sajilo serves `fyi.sajilo.Panel`: the button's label and icon as
//!   properties, and `Toggle`/`Quit` for its clicks.
//! - The extension owns `fyi.sajilo.ShellExtension` while its button is in the
//!   bar. Sajilo hides its tray icon for as long as that name is owned and
//!   shows it again the moment it goes, so there is always exactly one icon,
//!   and the tray is the fallback whenever the extension is off or broken.
//!
//! The extension reaches GNOME as files: the .deb and .rpm install them for
//! every user; for anything else (the AppImage, a build run from source)
//! Sajilo copies them into the user's own extensions folder. Either way GNOME
//! only notices a new extension at the next login, so until then the tray
//! works as before and Sajilo says so once.

// zbus hands every D-Bus property getter `&self`, whether it needs it or not.
#![allow(clippy::unused_self)]

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::AppHandle;
use zbus::blocking::Connection;
use zbus::blocking::fdo::DBusProxy;

/// The extension's id, as GNOME knows it.
pub const UUID: &str = "sajilo@sajilo.fyi";

const APP_BUS: &str = "fyi.sajilo.Panel";
const APP_PATH: &str = "/fyi/sajilo/Panel";
const EXTENSION_BUS: &str = "fyi.sajilo.ShellExtension";

/// Where the .deb and .rpm put the extension.
const SYSTEM_DIR: &str = "/usr/share/gnome-shell/extensions/sajilo@sajilo.fyi";

/// Left in the user's copy, so Sajilo only ever removes a copy it made.
const OURS: &str = ".installed-by-sajilo";

/// The extension's files, relative to its folder.
const FILES: &[(&str, &[u8])] = &[
    (
        "metadata.json",
        include_bytes!("../../../../gnome-extension/metadata.json"),
    ),
    (
        "extension.js",
        include_bytes!("../../../../gnome-extension/extension.js"),
    ),
    (
        "stylesheet.css",
        include_bytes!("../../../../gnome-extension/stylesheet.css"),
    ),
    (
        "icons/flag.svg",
        include_bytes!("../../../../gnome-extension/icons/flag.svg"),
    ),
    (
        "icons/sajilo.png",
        include_bytes!("../../../../gnome-extension/icons/sajilo.png"),
    ),
];

/// Asked once per install: Sajilo turns the extension on for the user a
/// single time, and never again if they later turn it off.
const ENABLED_KEY: &str = "gnomeExtensionEnabled";
/// The one notification saying how to open Sajilo until the next login.
const TIP_KEY: &str = "gnomeOneClickTipShown";

/// Whether the extension's button is in the top bar right now.
static BUTTON_UP: AtomicBool = AtomicBool::new(false);

/// What the button shows: the tray's label and `flag` or `app`.
static SHOWN: Mutex<(String, &str)> = Mutex::new((String::new(), "flag"));

/// Whether this is a GNOME session, where the button can live.
pub fn is_gnome_session() -> bool {
    std::env::var("XDG_CURRENT_DESKTOP").is_ok_and(|desktops| {
        desktops
            .split(':')
            .any(|desktop| desktop.eq_ignore_ascii_case("GNOME"))
    })
}

/// Whether the extension's button stands in for the tray icon right now.
pub fn button_up() -> bool {
    BUTTON_UP.load(Ordering::SeqCst)
}

/// Serves the button, installs and enables the extension where needed, and
/// swaps the tray icon out while the button is up. Blocking: run it on its own
/// thread. `tray_on_gnome` is whether GNOME's AppIndicator extension hosts
/// the tray, which changes what the first-run tip says.
pub fn run(app: &AppHandle, tray_on_gnome: bool) {
    let Some(bus) = crate::system::dbus::session() else {
        return;
    };
    if serve(app, bus).is_err() {
        return;
    }
    install();
    enable_once(app);
    watch_button(app, bus, tray_on_gnome);
}

/// The D-Bus side of the button.
struct Panel {
    app: AppHandle,
}

#[zbus::interface(name = "fyi.sajilo.Panel")]
impl Panel {
    /// A left click on the button. The rect is the button's, in the shell's
    /// screen pixels: Sajilo opens centred under it.
    fn toggle(&self, x: i32, y: i32, width: i32, height: i32) {
        crate::window::remember_tray_click((x + width / 2, y + height));
        let app = self.app.clone();
        let _ = self
            .app
            .run_on_main_thread(move || crate::window::tray_click_on_linux(&app));
    }

    /// "Quit Sajilo" in the button's right-click menu.
    fn quit(&self) {
        self.app.exit(0);
    }

    /// The date text beside the icon, the same as the tray's.
    #[zbus(property)]
    fn label(&self) -> String {
        SHOWN
            .lock()
            .map(|shown| shown.0.clone())
            .unwrap_or_default()
    }

    /// `flag` or `app`, as chosen in Settings.
    #[zbus(property)]
    fn icon(&self) -> String {
        SHOWN
            .lock()
            .map_or_else(|_| "flag".to_owned(), |shown| shown.1.to_owned())
    }

    /// Bumped if the interface ever changes, so an extension left over from an
    /// older Sajilo can tell.
    #[zbus(property)]
    fn version(&self) -> u32 {
        1
    }
}

fn serve(app: &AppHandle, bus: &Connection) -> zbus::Result<()> {
    bus.object_server()
        .at(APP_PATH, Panel { app: app.clone() })?;
    bus.request_name(APP_BUS)?;
    Ok(())
}

/// Updates what the button shows; called with every tray redraw. Cheap when
/// nothing changed, as on most of the clock's minute ticks.
pub fn show(label: &str, flag: bool) {
    let icon = if flag { "flag" } else { "app" };
    {
        let Ok(mut shown) = SHOWN.lock() else {
            return;
        };
        if shown.0 == label && shown.1 == icon {
            return;
        }
        *shown = (label.to_owned(), icon);
    }
    let Some(bus) = crate::system::dbus::session() else {
        return;
    };
    let Ok(panel) = bus.object_server().interface::<_, Panel>(APP_PATH) else {
        return;
    };
    let emitter = panel.signal_emitter();
    let panel = panel.get();
    let _ = zbus::block_on(panel.label_changed(emitter));
    let _ = zbus::block_on(panel.icon_changed(emitter));
}

/// Follows the extension's name: while it is owned the button is in the bar,
/// and the tray icon steps aside.
fn watch_button(app: &AppHandle, bus: &Connection, tray_on_gnome: bool) {
    let Ok(dbus) = DBusProxy::new(bus) else {
        return;
    };
    let Ok(name) = zbus::names::BusName::try_from(EXTENSION_BUS) else {
        return;
    };
    // Subscribe before asking, so a change in between is not missed.
    let changes = dbus.receive_name_owner_changed_with_args(&[(0, EXTENSION_BUS)]);
    let up = dbus.name_has_owner(name).unwrap_or(false);
    set_button_up(app, up);
    if !up {
        tell_how_to_open(app, tray_on_gnome);
    }
    let Ok(changes) = changes else {
        return;
    };
    for change in changes {
        if let Ok(args) = change.args() {
            set_button_up(app, args.new_owner().is_some());
        }
    }
}

fn set_button_up(app: &AppHandle, up: bool) {
    BUTTON_UP.store(up, Ordering::SeqCst);
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(tray) = handle.tray_by_id(super::ID) {
            let _ = tray.set_visible(!up);
        }
    });
}

/// Puts the extension where GNOME looks for it, when no package did.
///
/// A package's copy wins: an old copy of Sajilo's own in the user's folder
/// would shadow it (GNOME prefers the user's folder), so it is removed.
fn install() {
    let Some(user_dir) = user_extension_dir() else {
        return;
    };
    if Path::new(SYSTEM_DIR).join("metadata.json").exists() {
        if user_dir.join(OURS).exists() {
            let _ = std::fs::remove_dir_all(&user_dir);
        }
        return;
    }
    // Someone's own copy (say, from extensions.gnome.org) is left alone.
    if user_dir.exists() && !user_dir.join(OURS).exists() {
        return;
    }
    for (name, bytes) in FILES {
        let path = user_dir.join(name);
        if std::fs::read(&path).is_ok_and(|current| current == *bytes) {
            continue;
        }
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&path, bytes);
    }
    let _ = std::fs::write(user_dir.join(OURS), b"");
}

fn user_extension_dir() -> Option<PathBuf> {
    let data = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|dir| dir.is_absolute())
        .or_else(|| {
            std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share"))
        })?;
    Some(data.join("gnome-shell/extensions").join(UUID))
}

/// Turns the extension on for this user, once per install.
///
/// Left alone where extensions are switched off for the user (a managed
/// machine) and where the user has already turned this one off.
fn enable_once(app: &AppHandle) {
    if crate::db::get_json(app, ENABLED_KEY)
        .ok()
        .flatten()
        .is_some()
    {
        return;
    }
    if read_setting("disable-user-extensions").as_deref() == Some("true") {
        return;
    }
    let disabled = read_setting("disabled-extensions").map(|list| parse_list(&list));
    if disabled.is_some_and(|disabled| disabled.iter().any(|id| id == UUID)) {
        let _ = crate::db::set_json(app, ENABLED_KEY, &serde_json::Value::Bool(false));
        return;
    }
    if switch(true) {
        let _ = crate::db::set_json(app, ENABLED_KEY, &serde_json::Value::Bool(true));
    }
}

/// Whether the button is switched on for this user, for Settings.
pub fn is_on() -> bool {
    let listed = |key: &str| {
        read_setting(key).is_some_and(|list| parse_list(&list).iter().any(|id| id == UUID))
    };
    listed("enabled-extensions")
        && !listed("disabled-extensions")
        && read_setting("disable-user-extensions").as_deref() != Some("true")
}

/// The Settings switch. Remembered, so Sajilo never switches it back on by
/// itself after the user switched it off.
pub fn set_on(app: &AppHandle, on: bool) -> bool {
    let done = switch(on);
    if done {
        let _ = crate::db::set_json(app, ENABLED_KEY, &serde_json::Value::Bool(on));
    }
    done
}

/// Switches the extension on or off for this user.
///
/// Writes GNOME's lists through `gsettings`, which is what GNOME reads at
/// login and follows live, rather than only calling `gnome-extensions`:
/// GNOME learns of a new extension only at login, and until then
/// `gnome-extensions` refuses one it hasn't seen.
fn switch(on: bool) -> bool {
    let Some(enabled) = read_setting("enabled-extensions").map(|list| parse_list(&list)) else {
        return false;
    };
    let disabled = read_setting("disabled-extensions")
        .map(|list| parse_list(&list))
        .unwrap_or_default();
    let (mut add_to, mut take_from, add_key, take_key) = if on {
        (
            enabled,
            disabled,
            "enabled-extensions",
            "disabled-extensions",
        )
    } else {
        (
            disabled,
            enabled,
            "disabled-extensions",
            "enabled-extensions",
        )
    };
    let mut ok = true;
    if take_from.iter().any(|id| id == UUID) {
        take_from.retain(|id| id != UUID);
        ok &= write_setting(take_key, &take_from);
    }
    if !add_to.iter().any(|id| id == UUID) {
        add_to.push(UUID.to_owned());
        ok &= write_setting(add_key, &add_to);
    }
    ok
}

fn read_setting(key: &str) -> Option<String> {
    std::process::Command::new("gsettings")
        .args(["get", "org.gnome.shell", key])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

fn write_setting(key: &str, ids: &[String]) -> bool {
    std::process::Command::new("gsettings")
        .args(["set", "org.gnome.shell", key, format_list(ids).as_str()])
        .status()
        .is_ok_and(|status| status.success())
}

/// Reads a GVariant string array as `gsettings` prints it: `['a', 'b']`, or
/// `@as []` when empty. Extension ids never hold quotes.
fn parse_list(text: &str) -> Vec<String> {
    text.split('\'')
        .skip(1)
        .step_by(2)
        .map(str::to_owned)
        .collect()
}

fn format_list(ids: &[String]) -> String {
    let quoted: Vec<String> = ids.iter().map(|id| format!("'{id}'")).collect();
    format!("[{}]", quoted.join(", "))
}

/// Once per install, while the button is not up yet: how to open Sajilo now,
/// and that one click will do after the next login. A notification rather than
/// a card, because someone who can't open Sajilo can't see a card.
fn tell_how_to_open(app: &AppHandle, tray_on_gnome: bool) {
    use sajilo_core::focus::Language;
    use tauri_plugin_notification::NotificationExt;

    let told = crate::db::get_json(app, TIP_KEY).ok().flatten().is_some();
    // Turned off by the user: no promise of a button after the next login.
    let declined = crate::db::get_json(app, ENABLED_KEY).ok().flatten()
        == Some(serde_json::Value::Bool(false));
    if told || declined {
        return;
    }
    let (title, body) = match (crate::prefs::language(app), tray_on_gnome) {
        (Language::En, true) => (
            "Sajilo is in your top bar",
            "For now, double-click the flag to open Sajilo. After you next log out and back in, one click will do.",
        ),
        (Language::En, false) => (
            "Sajilo is running",
            "Log out and back in once, and Sajilo's button appears in the top bar.",
        ),
        (Language::Ne, true) => (
            "सजिलो माथिल्लो बारमा छ",
            "अहिलेलाई सजिलो खोल्न झण्डामा दुईपटक क्लिक गर्नुहोस्। अर्कोपटक लगआउट गरेर फेरि लगइन गरेपछि एकपटक क्लिक गरे पुग्छ।",
        ),
        (Language::Ne, false) => (
            "सजिलो चलिरहेको छ",
            "एकपटक लगआउट गरेर फेरि लगइन गर्नुहोस्, सजिलोको बटन माथिल्लो बारमा देखिन्छ।",
        ),
    };
    if app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .is_ok()
    {
        let _ = crate::db::set_json(app, TIP_KEY, &serde_json::Value::Bool(true));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_and_writes_gsettings_lists() {
        assert!(parse_list("@as []").is_empty());
        let list = parse_list("['ubuntu-dock@ubuntu.com', 'tiling-assistant@ubuntu.com']");
        assert_eq!(
            list,
            ["ubuntu-dock@ubuntu.com", "tiling-assistant@ubuntu.com"]
        );
        assert_eq!(format_list(&[UUID.to_owned()]), "['sajilo@sajilo.fyi']");
    }
}
