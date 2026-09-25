//! The desktop session's D-Bus, opened once and shared by everything that
//! asks the Linux desktop about the user: idle time, a held display.

use std::sync::OnceLock;

use zbus::blocking::Connection;

/// The session bus, or `None` where there is none (a bare window manager, or
/// no graphical session at all).
pub fn session() -> Option<&'static Connection> {
    static SESSION: OnceLock<Option<Connection>> = OnceLock::new();
    SESSION.get_or_init(|| Connection::session().ok()).as_ref()
}
