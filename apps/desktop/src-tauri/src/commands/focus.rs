//! Focus: the platform side of break reminders.
//!
//! The rules — what counts as time at the computer, when a break is due,
//! whether it was taken — live in `sajilo_core::focus` and are tested there.
//! This file owns what needs the platform: reading idle time every few
//! seconds, keeping the tracker between launches, and delivering the
//! notification.

use std::sync::Mutex;
use std::time::Duration;

use chrono::{Local, NaiveDateTime, Utc};
use sajilo_core::focus::{self, FocusSettings, FocusSnapshot, FocusState, PauseChoice, Tick};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_notification::NotificationExt;

use crate::{background_refresh, db, prefs};

const SETTINGS_KEY: &str = "focus.settings.v1";
const STATE_KEY: &str = "focus.state.v1";
/// Short enough to notice a 20-second look away; the work per tick is a clock
/// read and a little arithmetic.
const TICK: Duration = Duration::from_secs(15);
/// The tracker is written every minute rather than every tick. A crash loses
/// at most that much screen time.
const SAVE_EVERY_TICKS: u32 = 4;

type Result<T> = std::result::Result<T, String>;

/// The tracker and its settings, shared by the ticking loop and the commands
/// so a glass logged mid-tick is never overwritten.
#[derive(Default)]
pub struct FocusRuntime(Mutex<Option<Tracker>>);

struct Tracker {
    state: FocusState,
    settings: FocusSettings,
    unsaved_ticks: u32,
}

fn read<T: serde::de::DeserializeOwned + Default>(app: &AppHandle<Wry>, key: &str) -> T {
    db::get_json(app, key)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

fn write<T: serde::Serialize>(app: &AppHandle<Wry>, key: &str, value: &T) -> Result<()> {
    let value = serde_json::to_value(value).map_err(|error| error.to_string())?;
    db::set_json(app, key, &value)
}

/// Runs `change` on the tracker, loading it on first use.
fn with_tracker<R>(app: &AppHandle<Wry>, change: impl FnOnce(&mut Tracker) -> R) -> R {
    let runtime = app.state::<FocusRuntime>();
    let mut guard = runtime
        .0
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let tracker = guard.get_or_insert_with(|| Tracker {
        state: read(app, STATE_KEY),
        settings: read::<FocusSettings>(app, SETTINGS_KEY).normalised(),
        unsaved_ticks: 0,
    });
    change(tracker)
}

fn now() -> (chrono::DateTime<Utc>, NaiveDateTime) {
    (Utc::now(), Local::now().naive_local())
}

fn save_state(app: &AppHandle<Wry>, tracker: &mut Tracker) -> Result<()> {
    tracker.unsaved_ticks = 0;
    write(app, STATE_KEY, &tracker.state)
}

fn view(tracker: &mut Tracker) -> FocusSnapshot {
    let (now, local) = now();
    focus::snapshot(&mut tracker.state, &tracker.settings, now, local)
}

#[tauri::command]
pub fn focus_snapshot(app: AppHandle<Wry>) -> FocusSnapshot {
    with_tracker(&app, view)
}

#[tauri::command]
pub fn set_focus_settings(app: AppHandle<Wry>, settings: FocusSettings) -> Result<FocusSnapshot> {
    let settings = settings.normalised();
    write(&app, SETTINGS_KEY, &settings)?;
    Ok(with_tracker(&app, |tracker| {
        tracker.settings = settings;
        view(tracker)
    }))
}

/// Switches on the recommended reminders in one step, from the screen's first
/// card. Which ones those are is the core's call, not the screen's.
#[tauri::command]
pub fn enable_recommended_breaks(app: AppHandle<Wry>) -> Result<FocusSnapshot> {
    let settings = with_tracker(&app, |tracker| {
        tracker.settings.clone().with_recommended_breaks()
    });
    set_focus_settings(app, settings)
}

#[tauri::command]
pub fn log_focus_water(app: AppHandle<Wry>, delta: i32) -> Result<FocusSnapshot> {
    with_tracker(&app, |tracker| {
        focus::log_water(&mut tracker.state, now().1, delta.clamp(-1, 1));
        save_state(&app, tracker)?;
        Ok(view(tracker))
    })
}

#[tauri::command]
pub fn pause_focus(app: AppHandle<Wry>, choice: PauseChoice) -> Result<FocusSnapshot> {
    with_tracker(&app, |tracker| {
        let (now, local) = now();
        focus::pause(&mut tracker.state, choice, now, local);
        save_state(&app, tracker)?;
        Ok(view(tracker))
    })
}

/// One measurement: advance the tracker and announce whatever came due.
fn measure(app: &AppHandle<Wry>) {
    let idle = crate::system::idle::seconds();
    let announcements = with_tracker(app, |tracker| {
        let (now, local) = now();
        let due = focus::tick(
            &mut tracker.state,
            &tracker.settings,
            Tick {
                now,
                local,
                idle_seconds: idle,
            },
        );
        tracker.unsaved_ticks += 1;
        if !due.is_empty() || tracker.unsaved_ticks >= SAVE_EVERY_TICKS {
            let _ = save_state(app, tracker);
        }
        let today = tracker.state.today.clone();
        due.into_iter()
            .filter_map(|kind| {
                today
                    .as_ref()
                    .map(|day| focus::message(kind, day, &tracker.settings))
            })
            .collect::<Vec<_>>()
    });

    for (title, body) in announcements {
        if let Err(error) = app
            .notification()
            .builder()
            .title(&title)
            .body(&body)
            .show()
        {
            eprintln!("sajilo: could not deliver a focus reminder: {error}");
        }
    }
}

/// Ticks for as long as the app runs. With Focus switched off in Settings it
/// neither measures nor reminds; the gap reads as time away when it returns.
pub fn spawn(app: AppHandle<Wry>) {
    tauri::async_runtime::spawn(async move {
        loop {
            let sleeper = tauri::async_runtime::spawn_blocking(|| std::thread::sleep(TICK));
            if sleeper.await.is_err() {
                return;
            }
            if background_refresh::enabled(&app, prefs::FOCUS_ENABLED) {
                measure(&app);
            }
        }
    });
}
