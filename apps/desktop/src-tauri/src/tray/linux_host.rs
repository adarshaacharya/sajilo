//! Which kind of tray icon this Linux desktop gets: the one its tray gives a
//! single left click to.
//!
//! | Tray | Kind | Why |
//! |---|---|---|
//! | KDE, Cinnamon, Xfce, MATE, Waybar | StatusNotifierItem | The panel calls `Activate` on a left click, and shows the date beside the icon |
//! | GNOME's AppIndicator extension (Ubuntu, Fedora, Pop!_OS) | System Tray ([`super::xembed`]) | The extension opens a StatusNotifierItem's menu on a left click, but hands a System Tray icon the click |
//! | i3bar, polybar and other bars without a StatusNotifierItem host | System Tray | The only kind they show |
//!
//! Without X11 (GDK drawing straight to Wayland) there is no System Tray, so
//! it is always the StatusNotifierItem.

use std::time::{Duration, Instant};

/// The two kinds of Linux tray icon.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Host {
    /// A StatusNotifierItem, through Tauri's tray (ksni).
    StatusNotifier,
    /// A System Tray icon; see [`super::xembed`].
    SystemTray,
}

/// The bus name a StatusNotifierItem host answers on.
const WATCHER: &str = "org.kde.StatusNotifierWatcher";

/// How long one kind of tray waits for the other to join it before it counts.
/// KDE on X11 starts both, and its System Tray (a bridge, `xembedsniproxy`)
/// can come up a moment before the panel; GNOME's extension starts both too.
const WATCHER_GRACE: Duration = Duration::from_secs(3);

/// How often, while neither kind of tray is up yet (as at login, before the
/// panel), to look again; less often after the first minute, when there may
/// be no tray at all (GNOME without the extension).
const RETRY: Duration = Duration::from_millis(500);
const SLOW_RETRY: Duration = Duration::from_secs(5);
const SLOW_AFTER: Duration = Duration::from_secs(60);

/// Picks the kind of icon, waiting for the panel if it is not up yet.
/// Blocking: call it off the main thread.
pub fn wait_for_host() -> Host {
    let started = Instant::now();
    loop {
        if let Some(host) = pick(started.elapsed() >= WATCHER_GRACE) {
            return host;
        }
        std::thread::sleep(if started.elapsed() < SLOW_AFTER {
            RETRY
        } else {
            SLOW_RETRY
        });
    }
}

/// The kind of icon, if the desktop has made it clear yet. `settled` once
/// the other kind of tray has had [`WATCHER_GRACE`] to turn up.
pub fn pick(settled: bool) -> Option<Host> {
    let system_tray = crate::window::on_x11() && super::xembed::tray_running();
    match watcher_program() {
        Some(program) if program == "gnome-shell" => {
            // The extension starts its System Tray alongside its
            // StatusNotifierItem host; give it a moment to, and fall back to
            // the StatusNotifierItem where it is turned off in its settings.
            if system_tray {
                Some(Host::SystemTray)
            } else {
                settled.then_some(Host::StatusNotifier)
            }
        }
        Some(_) => Some(Host::StatusNotifier),
        None if !crate::window::on_x11() => Some(Host::StatusNotifier),
        None if system_tray && settled => Some(Host::SystemTray),
        None => None,
    }
}

/// The program that hosts StatusNotifierItems, by its process name, or
/// `None` when nothing does. An empty name when it runs but cannot be named.
fn watcher_program() -> Option<String> {
    let bus = crate::system::dbus::session()?;
    let dbus = zbus::blocking::fdo::DBusProxy::new(bus).ok()?;
    let name = zbus::names::BusName::try_from(WATCHER).ok()?;
    if !dbus.name_has_owner(name.clone()).ok()? {
        return None;
    }
    let pid = dbus.get_connection_unix_process_id(name).unwrap_or(0);
    Some(
        std::fs::read_to_string(format!("/proc/{pid}/comm"))
            .map(|comm| comm.trim().to_owned())
            .unwrap_or_default(),
    )
}
