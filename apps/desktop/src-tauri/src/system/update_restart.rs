//! Finishing an installed update without anyone having to restart.
//!
//! The updater downloads and installs a new version on its own, but the
//! version that runs is the one that started. A menu-bar app starts at login
//! and is rarely quit, and a Mac is rarely restarted — it sleeps — so an
//! installed update could sit unused for weeks while the old version kept
//! running. Telemetry showed exactly that: Macs on old versions long after the
//! update had been installed.
//!
//! So once an update is installed, Sajilo restarts itself at the first moment
//! nobody would notice: the person has been away for a while, the window is
//! closed, no card is on screen, and the radio is silent. Someone who is using
//! the computer is never interrupted.
//!
//! Windows can't swap the files of a running app, so its installer closes
//! Sajilo the moment it starts. There the update is only downloaded at first,
//! and the install itself waits for the same quiet moment.
//!
//! Either way the restart leaves a note, so the new version comes back the way
//! the old one was: in the tray, window closed — not as if opened by hand.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, Wry};

use super::{card_window, idle};
use crate::db;

/// When the last quiet restart happened, as Unix seconds.
const QUIET_RESTART_KEY: &str = "quietRestartAt";
/// A note older than this belongs to an install that never finished.
const QUIET_RESTART_FRESH_SECONDS: u64 = 15 * 60;
/// Tells the update window a downloaded update can be installed now.
const INSTALL_NOW_EVENT: &str = "sajilo://updater-install-now";

/// Away this long, and the restart goes unnoticed.
const AWAY_SECONDS: u32 = 10 * 60;
const CHECK_EVERY: Duration = Duration::from_secs(60);

/// An update is installed and waiting for the app to start again.
static PENDING: AtomicBool = AtomicBool::new(false);
/// The radio is playing, which a restart would cut off.
static AUDIO_PLAYING: AtomicBool = AtomicBool::new(false);
/// The watcher is running; one is enough.
static WATCHING: AtomicBool = AtomicBool::new(false);

/// What the moment looks like, for [`should_restart`].
#[derive(Debug, Clone, Copy)]
struct Moment {
    pending: bool,
    audio_playing: bool,
    /// `None` where the desktop cannot say how long input has been idle.
    idle_seconds: Option<u32>,
    popover_open: bool,
    card_open: bool,
}

/// Whether now is a moment nobody would notice a restart.
///
/// Unknown idle time never qualifies: without it there is no telling whether
/// someone is in the middle of something, and the update can wait for the
/// next ordinary start.
fn should_restart(moment: Moment) -> bool {
    moment.pending
        && !moment.audio_playing
        && !moment.popover_open
        && !moment.card_open
        && moment.idle_seconds.is_some_and(|idle| idle >= AWAY_SECONDS)
}

fn visible(app: &AppHandle<Wry>, label: &str) -> bool {
    app.get_webview_window(label)
        .is_some_and(|window| window.is_visible().unwrap_or(false))
}

fn moment(app: &AppHandle<Wry>) -> Moment {
    Moment {
        pending: PENDING.load(Ordering::SeqCst),
        audio_playing: AUDIO_PLAYING.load(Ordering::SeqCst),
        idle_seconds: idle::seconds(),
        popover_open: visible(app, crate::window::MAIN),
        card_open: visible(app, card_window::BREAK) || visible(app, card_window::REMINDER),
    }
}

/// What happens at the quiet moment.
#[derive(Debug, Clone, Copy)]
enum Finish {
    /// Installed on disk; start again into it.
    Restart,
    /// Downloaded only (Windows); the update window installs it, which
    /// closes and reopens the app.
    Install,
}

fn now_seconds() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs())
}

fn note_quiet_restart(app: &AppHandle<Wry>) {
    let _ = db::set_json(app, QUIET_RESTART_KEY, &serde_json::json!(now_seconds()));
}

/// Whether this launch is the app coming back from a quiet restart, and so
/// should stay in the tray. Reads the note once.
pub fn returning_from_quiet_restart(app: &AppHandle<Wry>) -> bool {
    let noted = db::get_json(app, QUIET_RESTART_KEY)
        .ok()
        .flatten()
        .and_then(|value| value.as_u64());
    if noted.is_some() {
        let _ = db::delete_json(app, QUIET_RESTART_KEY);
    }
    noted.is_some_and(|at| fresh(at, now_seconds()))
}

fn fresh(noted_at: u64, now: u64) -> bool {
    now.saturating_sub(noted_at) <= QUIET_RESTART_FRESH_SECONDS
}

fn watch(app: AppHandle<Wry>, finish: Finish) {
    PENDING.store(true, Ordering::SeqCst);
    if WATCHING.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(CHECK_EVERY);
            if should_restart(moment(&app)) {
                note_quiet_restart(&app);
                match finish {
                    Finish::Restart => app.request_restart(),
                    Finish::Install => {
                        let _ = app.emit(INSTALL_NOW_EVENT, ());
                    }
                }
                return;
            }
        }
    });
}

/// Called by the update window once an update is installed. Starts watching
/// for a quiet moment to restart into it.
#[tauri::command]
pub fn update_installed(app: AppHandle<Wry>) {
    watch(app, Finish::Restart);
}

/// Called by the update window on Windows once an update is downloaded.
/// Starts watching for a quiet moment to install it.
#[tauri::command]
pub fn update_downloaded(app: AppHandle<Wry>) {
    watch(app, Finish::Install);
}

/// Called by the radio as it starts and stops.
#[tauri::command]
pub fn set_audio_playing(playing: bool) {
    AUDIO_PLAYING.store(playing, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn quiet() -> Moment {
        Moment {
            pending: true,
            audio_playing: false,
            idle_seconds: Some(AWAY_SECONDS),
            popover_open: false,
            card_open: false,
        }
    }

    #[test]
    fn restarts_into_an_installed_update_once_the_person_is_away() {
        assert!(should_restart(quiet()));
    }

    #[test]
    fn never_interrupts_someone_who_is_there() {
        let cases = [
            Moment {
                pending: false,
                ..quiet()
            },
            Moment {
                audio_playing: true,
                ..quiet()
            },
            Moment {
                idle_seconds: Some(AWAY_SECONDS - 1),
                ..quiet()
            },
            Moment {
                idle_seconds: None,
                ..quiet()
            },
            Moment {
                popover_open: true,
                ..quiet()
            },
            Moment {
                card_open: true,
                ..quiet()
            },
        ];
        for moment in cases {
            assert!(!should_restart(moment), "{moment:?}");
        }
    }

    #[test]
    fn only_a_recent_note_keeps_the_window_closed() {
        assert!(fresh(1_000, 1_000));
        assert!(fresh(1_000, 1_000 + QUIET_RESTART_FRESH_SECONDS));
        assert!(!fresh(1_000, 1_001 + QUIET_RESTART_FRESH_SECONDS));
        // A clock set back is still the same restart, not a stale one.
        assert!(fresh(2_000, 1_000));
    }
}
