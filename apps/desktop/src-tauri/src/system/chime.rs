//! The soft sound that goes with a Focus reminder.
//!
//! One sound everywhere: `resources/chime.wav`, synthesised by
//! `scripts/make-chime.py` and bundled with the app, rather than whatever the
//! platform's alert happens to be — a gentle bell on a Mac, a harsh ding on
//! Windows, and on many Linux desktops nothing at all. It is played by the
//! operating system, not a webview: the popover's webview is usually hidden,
//! and a hidden page may not be allowed to start audio.
//!
//! Fire and forget: a missing file or player is silence, never an error.

use std::path::PathBuf;

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, Wry};

pub fn play(app: &AppHandle<Wry>) {
    let Some(file) = chime_file(app) else {
        return;
    };
    platform::play(&file);
}

fn chime_file(app: &AppHandle<Wry>) -> Option<PathBuf> {
    app.path()
        .resolve("chime.wav", BaseDirectory::Resource)
        .ok()
        .filter(|path| path.exists())
}

#[cfg(target_os = "macos")]
mod platform {
    use std::path::Path;

    pub fn play(file: &Path) {
        // Spawned, not waited on: `afplay` blocks for the length of the sound.
        let _ = std::process::Command::new("afplay").arg(file).spawn();
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;

    /// `SND_FILENAME | SND_NODEFAULT`: play this file, and if it cannot be
    /// played, stay silent rather than falling back to the system ding.
    const FLAGS: u32 = 0x0002_0000 | 0x0002;

    #[link(name = "winmm")]
    unsafe extern "system" {
        fn PlaySoundW(sound: *const u16, module: *mut c_void, flags: u32) -> i32;
    }

    pub fn play(file: &Path) {
        let wide: Vec<u16> = file.as_os_str().encode_wide().chain(Some(0)).collect();
        // Played synchronously on a thread of its own, so the path buffer
        // outlives the call without relying on how SND_ASYNC treats it.
        std::thread::spawn(move || {
            // SAFETY: `wide` is a NUL-terminated UTF-16 path that lives until
            // the call returns; no module handle is needed for a file.
            unsafe { PlaySoundW(wide.as_ptr(), std::ptr::null_mut(), FLAGS) };
        });
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use std::path::Path;

    /// PulseAudio, then PipeWire, then bare ALSA: the first one installed
    /// plays it.
    const PLAYERS: [&str; 3] = ["paplay", "pw-play", "aplay"];

    pub fn play(file: &Path) {
        for player in PLAYERS {
            let mut command = std::process::Command::new(player);
            if player == "aplay" {
                command.arg("-q");
            }
            if command.arg(file).spawn().is_ok() {
                return;
            }
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
mod platform {
    use std::path::Path;

    pub fn play(_file: &Path) {}
}
