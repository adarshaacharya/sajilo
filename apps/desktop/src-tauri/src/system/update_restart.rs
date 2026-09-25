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

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager, Wry};

use super::{card_window, idle};

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

/// Called by the update window once an update is installed. Starts watching
/// for a quiet moment to restart into it.
#[tauri::command]
pub fn update_installed(app: AppHandle<Wry>) {
    PENDING.store(true, Ordering::SeqCst);
    if WATCHING.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(CHECK_EVERY);
            if should_restart(moment(&app)) {
                app.request_restart();
                return;
            }
        }
    });
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
}
