//! The twelve daily rashifal readings.

use chrono::Utc;
use sajilo_api::load_state::LoadState;
use sajilo_api::rashifal::{RashiSign, RashifalSnapshot};
use sajilo_providers::{HttpClient, hamropatro};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::prefs::{RASHIFAL_KEY, SELECTED_RASHI};

/// One reading per day, published each morning. Half a day keeps it labelled
/// fresh through the day it belongs to.
const MAX_AGE_SECS: i64 = 12 * 60 * 60;
const REFETCH_AFTER_SECS: i64 = 60 * 60;

pub struct RashifalCache {
    feed: Feed<RashifalSnapshot>,
    client: HttpClient,
}

impl Default for RashifalCache {
    fn default() -> Self {
        Self {
            feed: Feed::new(RASHIFAL_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            client: HttpClient::new(),
        }
    }
}

#[tauri::command]
pub async fn get_rashifal(
    app: AppHandle<Wry>,
    refresh: Option<bool>,
) -> LoadState<RashifalSnapshot> {
    let cache = app.state::<RashifalCache>();
    let client = &cache.client;
    let now = Utc::now();

    cache
        .feed
        .get(&app, now, refresh.unwrap_or(false), || {
            hamropatro::fetch(client, now)
        })
        .await
}

/// The cached readings, without fetching.
fn cached(app: &AppHandle<Wry>) -> Option<(RashifalSnapshot, chrono::DateTime<Utc>)> {
    app.try_state::<RashifalCache>()?.feed.peek(app)
}

/// The user's own sign, as the Rashifal tab saved it.
fn my_sign(app: &AppHandle<Wry>) -> Option<RashiSign> {
    crate::db::get_json(app, SELECTED_RASHI)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
}

/// The daily reminder: today's reading for the user's sign, the first time
/// they sit down in the morning. When is decided by
/// `sajilo_core::rashifal`; this owns the platform half.
pub mod reminder {
    use chrono::{Local, Utc};
    use sajilo_api::rashifal::RashiSign;
    use sajilo_core::focus::ReminderStyle;
    use sajilo_core::nepal_time;
    use sajilo_core::notify::{NotificationOptions, PlannedNotification, ReminderKind};
    use sajilo_core::rashifal::{self, MorningState, Step, Tick};
    use tauri::{AppHandle, Wry};
    use tauri_plugin_notification::NotificationExt;

    use crate::{background_refresh, db, prefs};

    const STATE_KEY: &str = "rashifalMorning.v1";
    const TICK: std::time::Duration = std::time::Duration::from_secs(15);

    fn state(app: &AppHandle<Wry>) -> MorningState {
        db::get_json(app, STATE_KEY)
            .ok()
            .flatten()
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default()
    }

    fn save(app: &AppHandle<Wry>, state: &MorningState) {
        if let Ok(value) = serde_json::to_value(state) {
            let _ = db::set_json(app, STATE_KEY, &value);
        }
    }

    /// Switched on, with a sign chosen and the Rashifal module showing.
    fn wanted(app: &AppHandle<Wry>) -> Option<RashiSign> {
        let options: NotificationOptions = db::get_json(app, prefs::NOTIFICATION_OPTIONS)
            .ok()
            .flatten()
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default();
        if !options.daily_rashifal
            || options.is_paused(Utc::now())
            || !background_refresh::enabled(app, prefs::RASHIFAL_ENABLED)
        {
            return None;
        }
        super::my_sign(app)
    }

    /// Today's reading for `sign`, if the cache has one fetched today. A
    /// reading from yesterday evening is yesterday's, and is never shown as
    /// this morning's.
    fn todays_reading(app: &AppHandle<Wry>, sign: RashiSign) -> Option<String> {
        let (snapshot, fetched_at) = super::cached(app)?;
        let fetched_on = fetched_at.with_timezone(&nepal_time::offset()).date_naive();
        if fetched_on != nepal_time::today() {
            return None;
        }
        snapshot
            .reading(sign)
            .map(|reading| reading.prediction.clone())
    }

    /// The Rashifal tab showed the user's own reading: no reminder today.
    #[tauri::command]
    pub fn rashifal_read(app: AppHandle<Wry>) {
        let mut state = state(&app);
        rashifal::mark_read(&mut state, Local::now().naive_local());
        save(&app, &state);
    }

    /// One measurement. Returns true when the reading should be fetched.
    fn measure(app: &AppHandle<Wry>) -> bool {
        let Some(sign) = wanted(app) else {
            return false;
        };
        let reading = todays_reading(app, sign);
        // Focus keeps track of calls and fullscreen apps, and which of them
        // the user lets hold reminders back; while it is off, nothing does.
        let held = background_refresh::enabled(app, prefs::FOCUS_ENABLED)
            && crate::commands::focus::holding(app);
        let mut state = state(app);
        let step = rashifal::step(
            &mut state,
            Tick {
                now: Utc::now(),
                local: Local::now().naive_local(),
                idle_seconds: crate::system::idle::seconds(),
                held,
                reading_ready: reading.is_some(),
            },
        );
        save(app, &state);
        match (step, reading) {
            (Step::Show, Some(body)) => {
                show(app, sign, body);
                false
            }
            (Step::NeedReading, _) => true,
            _ => false,
        }
    }

    fn show(app: &AppHandle<Wry>, sign: RashiSign, body: String) {
        let language = prefs::language(app);
        let title = rashifal::title(sign.display_name(), sign.nepali_name(), language);
        if crate::commands::notify::style(app) == ReminderStyle::Card {
            crate::commands::reminder_card::enqueue(
                app,
                vec![PlannedNotification {
                    id: rashifal::reminder_id(nepal_time::today()),
                    kind: ReminderKind::Rashifal,
                    title,
                    body,
                    fire_at: Utc::now(),
                }],
            );
        } else if let Err(error) = app
            .notification()
            .builder()
            .title(&title)
            .body(&body)
            .show()
        {
            eprintln!("sajilo: could not deliver the rashifal reminder: {error}");
        }
    }

    /// Ticks for as long as the app runs; does nothing until the reminder is
    /// switched on.
    pub fn spawn(app: AppHandle<Wry>) {
        tauri::async_runtime::spawn(async move {
            loop {
                let sleeper = tauri::async_runtime::spawn_blocking(|| std::thread::sleep(TICK));
                if sleeper.await.is_err() {
                    return;
                }
                let measured = app.clone();
                let Ok(fetch) =
                    tauri::async_runtime::spawn_blocking(move || measure(&measured)).await
                else {
                    return;
                };
                // The feed applies its own refetch interval, so asking on
                // every tick of a late morning does not hammer the source.
                if fetch {
                    super::get_rashifal(app.clone(), Some(false)).await;
                }
            }
        });
    }
}
