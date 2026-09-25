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
use sajilo_core::focus::{
    self, BreakOutcome, FocusSettings, FocusSnapshot, FocusState, PauseChoice, ReminderStyle, Tick,
};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_notification::NotificationExt;

use crate::system::card_window;
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
    // One choice for every reminder, made in Settings: breaks follow it.
    tracker.settings.style = crate::commands::notify::style(app);
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

/// "Turn off break reminders": every reminder off and any card put away, back
/// to the first screen.
#[tauri::command]
pub fn disable_breaks(app: AppHandle<Wry>) -> Result<FocusSnapshot> {
    let settings = with_tracker(&app, |tracker| {
        tracker.state.active_break = None;
        tracker.settings.clone().with_breaks_off()
    });
    let snapshot = set_focus_settings(app.clone(), settings)?;
    sync_card(&app);
    Ok(snapshot)
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
    .inspect(|_| sync_card(&app))
}

/// "Show me an example": the real card and chime, counting for nothing.
#[tauri::command]
pub fn preview_focus_break(app: AppHandle<Wry>, kind: focus::BreakKind) -> FocusSnapshot {
    let (snapshot, chime) = with_tracker(&app, |tracker| {
        focus::preview_break(&mut tracker.state, &tracker.settings, kind, Utc::now());
        (view(tracker), tracker.settings.chime)
    });
    if chime {
        crate::system::chime::play(&app);
    }
    sync_card(&app);
    snapshot
}

/// The break card's buttons, and its countdown running out.
#[tauri::command]
pub fn finish_focus_break(app: AppHandle<Wry>, outcome: BreakOutcome) -> Result<FocusSnapshot> {
    with_tracker(&app, |tracker| {
        focus::finish_break(&mut tracker.state, &tracker.settings, outcome, now().1);
        save_state(&app, tracker)?;
        Ok(view(tracker))
    })
    .inspect(|_| sync_card(&app))
}

/// What one measurement asks the platform to do.
struct Announce {
    chime: bool,
    /// Title and body of each notification, in the notification style.
    notifications: Vec<(String, String)>,
}

/// The app's language, which the frontend stores; notifications follow it.
fn notification_language(app: &AppHandle<Wry>) -> focus::Language {
    db::get_json(app, prefs::LANGUAGE)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

/// One measurement: advance the tracker and announce whatever came due.
fn measure(app: &AppHandle<Wry>) {
    let idle = crate::system::idle::seconds();
    // Only worth asking once input has gone quiet; while someone is typing,
    // the answer changes nothing.
    let display_held = idle.is_some_and(|idle| idle > focus::ACTIVE_WINDOW_SECONDS)
        && crate::system::display::held_awake();
    let language = notification_language(app);
    let announce = with_tracker(app, |tracker| {
        let (now, local) = now();
        let due = focus::tick(
            &mut tracker.state,
            &tracker.settings,
            Tick {
                now,
                local,
                idle_seconds: idle,
                display_held,
            },
        );
        tracker.unsaved_ticks += 1;
        if !due.is_empty() || tracker.unsaved_ticks >= SAVE_EVERY_TICKS {
            let _ = save_state(app, tracker);
        }
        let settings = &tracker.settings;
        let notifications = match (settings.style, tracker.state.today.clone()) {
            (ReminderStyle::Notification, Some(today)) => due
                .iter()
                .map(|kind| {
                    focus::announcement(&mut tracker.state, settings, *kind, &today, language)
                })
                .collect(),
            _ => Vec::new(),
        };
        Announce {
            chime: settings.chime && !due.is_empty(),
            notifications,
        }
    });

    if announce.chime {
        crate::system::chime::play(app);
    }
    for (title, body) in announce.notifications {
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
    sync_card(app);
}

/// Shows the break card while the tracker has one, and closes it otherwise —
/// after a tick opens or expires it, a button closes it, or a pause. A
/// reminder card already on screen goes first; the break shows when it closes.
pub fn sync_card(app: &AppHandle<Wry>) {
    let showing = with_tracker(app, |tracker| tracker.state.active_break.is_some());
    let window = app.get_webview_window(card_window::BREAK);
    match (showing, window) {
        (true, None) if !card_window::any_open(app) => {
            card_window::open(app, card_window::BREAK, "break", "Sajilo break");
        }
        (false, Some(window)) => card_window::dismiss(&window),
        _ => {}
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
