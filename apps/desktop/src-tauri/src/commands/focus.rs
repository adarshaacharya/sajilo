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
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent, Wry};
use tauri_plugin_notification::NotificationExt;

use crate::{background_refresh, db, prefs};

const SETTINGS_KEY: &str = "focus.settings.v1";
const STATE_KEY: &str = "focus.state.v1";
/// Where the user last dragged the break card, in logical pixels.
const CARD_PLACE_KEY: &str = "focus.cardPosition.v1";
/// Short enough to notice a 20-second look away; the work per tick is a clock
/// read and a little arithmetic.
const TICK: Duration = Duration::from_secs(15);
/// The tracker is written every minute rather than every tick. A crash loses
/// at most that much screen time.
const SAVE_EVERY_TICKS: u32 = 4;
/// The break card's window, created when a break comes due and closed when it
/// is dealt with.
const CARD: &str = "break";
const CARD_WIDTH: f64 = 380.0;
const CARD_HEIGHT: f64 = 114.0;
/// Space between the card and the screen edge it sits against.
const CARD_MARGIN: f64 = 14.0;

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
        focus::preview_break(&mut tracker.state, kind, Utc::now());
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

/// One measurement: advance the tracker and announce whatever came due.
fn measure(app: &AppHandle<Wry>) {
    let idle = crate::system::idle::seconds();
    let announce = with_tracker(app, |tracker| {
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
        let settings = &tracker.settings;
        let notifications = match (settings.style, tracker.state.today.as_ref()) {
            (ReminderStyle::Notification, Some(today)) => due
                .iter()
                .map(|kind| focus::message(*kind, today, settings))
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
/// after a tick opens or expires it, a button closes it, or a pause.
fn sync_card(app: &AppHandle<Wry>) {
    let showing = with_tracker(app, |tracker| tracker.state.active_break.is_some());
    let window = app.get_webview_window(CARD);
    match (showing, window) {
        (true, None) => open_card(app),
        (false, Some(window)) => {
            let _ = window.close();
        }
        _ => {}
    }
}

/// Opens the card at the top of the screen, without taking focus: a
/// reminder that grabbed the keyboard would swallow whatever was being typed.
fn open_card(app: &AppHandle<Wry>) {
    let mut builder = WebviewWindowBuilder::new(
        app,
        CARD,
        WebviewUrl::App("index.html?surface=break".into()),
    )
    .title("Sajilo break")
    .inner_size(CARD_WIDTH, CARD_HEIGHT)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .shadow(true)
    .focused(false);
    if let Some(place) = remembered_place(app).or_else(|| card_position(app)) {
        builder = builder.position(place.x, place.y);
    }
    match builder.build() {
        Ok(window) => {
            let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
            #[cfg(target_os = "macos")]
            crate::window::polish_macos_chrome(&window);
            // Dragged somewhere else, it opens there next time. A drag
            // reports every step, so the latest spot is kept in memory and
            // written once, when the card closes.
            let handle = app.clone();
            let scale = window.scale_factor().unwrap_or(1.0);
            let dragged_to = Mutex::new(None::<CardPlace>);
            window.on_window_event(move |event| match event {
                WindowEvent::Moved(position) => {
                    let place = CardPlace {
                        x: f64::from(position.x) / scale,
                        y: f64::from(position.y) / scale,
                    };
                    if let Ok(mut latest) = dragged_to.lock() {
                        *latest = Some(place);
                    }
                }
                WindowEvent::Destroyed => {
                    if let Some(place) = dragged_to.lock().ok().and_then(|latest| *latest) {
                        let _ = write(&handle, CARD_PLACE_KEY, &place);
                    }
                }
                _ => {}
            });
        }
        Err(error) => eprintln!("sajilo: could not open the break card: {error}"),
    }
}

/// A remembered card position, in logical pixels.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
struct CardPlace {
    x: f64,
    y: f64,
}

/// The last place the card was dragged to, if a connected screen still shows
/// it: a spot on a monitor since unplugged falls back to the default.
fn remembered_place(app: &AppHandle<Wry>) -> Option<CardPlace> {
    let place: CardPlace = db::get_json(app, CARD_PLACE_KEY)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())?;
    let monitors = app.available_monitors().ok()?;
    let visible = monitors.iter().any(|monitor| {
        let scale = monitor.scale_factor();
        let area = monitor.work_area();
        let left = f64::from(area.position.x) / scale;
        let top = f64::from(area.position.y) / scale;
        let right = left + f64::from(area.size.width) / scale;
        let bottom = top + f64::from(area.size.height) / scale;
        // Enough of the card to grab it again, not just a sliver.
        place.x >= left - CARD_WIDTH / 2.0
            && place.x + CARD_WIDTH / 2.0 <= right
            && place.y >= top
            && place.y + 40.0 <= bottom
    });
    visible.then_some(place)
}

/// Top centre, just under the menu bar or panel; bottom centre on Windows,
/// just above the taskbar. The right-hand corner is where the system stacks
/// its own notifications, which would cover the card. Logical pixels, from the
/// primary monitor's work area so the card never sits under a bar.
fn card_position(app: &AppHandle<Wry>) -> Option<CardPlace> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let left = f64::from(area.position.x) / scale;
    let top = f64::from(area.position.y) / scale;
    let width = f64::from(area.size.width) / scale;
    let height = f64::from(area.size.height) / scale;
    let x = left + (width - CARD_WIDTH) / 2.0;
    let y = if cfg!(target_os = "windows") {
        top + height - CARD_HEIGHT - CARD_MARGIN
    } else {
        top + CARD_MARGIN
    };
    Some(CardPlace { x, y })
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
