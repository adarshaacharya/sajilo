//! Scheduling the reminders `sajilo-core` planned.
//!
//! The planning rules live in core and are tested there. This file owns only the
//! parts that need the platform: asking permission, delivering a notification,
//! and remembering what has already been delivered so a restart cannot re-fire
//! it.

use crate::{db, prefs, prefs::NOTIFICATION_OPTIONS as OPTIONS_KEY};
use chrono::{NaiveDate, Utc};
use sajilo_core::calendar::bikram_sambat::nepali_date_from;
use sajilo_core::calendar::upcoming;
use sajilo_core::focus::ReminderStyle;
use sajilo_core::nepal_time;
use sajilo_core::notify::{
    IpoDeadline, LastFired, NotificationOptions, PlannedNotification, next_wake, plan_day_plans,
    plan_festivals, plan_ipo_closing, plan_sip_payments, should_fire_late,
};
use tauri::{AppHandle, Wry};
use tauri_plugin_notification::{NotificationExt, PermissionState};

const LAST_FIRED_KEY: &str = "lastFired.v1";

type Result<T> = std::result::Result<T, String>;

/// Permission is requested when the user switches a reminder on, never at
/// launch. Reminders are on by default without a request: desktop notification
/// permission is granted by the plugin, so there is nothing to ask for on the
/// platforms Sajilo ships.
#[tauri::command]
pub fn notification_permission(app: AppHandle<Wry>) -> Result<String> {
    app.notification()
        .permission_state()
        .map(|state| state_name(state).to_owned())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn request_notification_permission(app: AppHandle<Wry>) -> Result<String> {
    app.notification()
        .request_permission()
        .map(|state| state_name(state).to_owned())
        .map_err(|e| e.to_string())
}

fn state_name(state: PermissionState) -> &'static str {
    match state {
        PermissionState::Granted => "granted",
        PermissionState::Denied => "denied",
        // Includes `Prompt`, and whatever the plugin adds later: treating an
        // unrecognised state as unknown means the UI asks rather than assuming
        // it was refused.
        _ => "unknown",
    }
}

fn read<T: serde::de::DeserializeOwned + Default>(app: &AppHandle<Wry>, key: &str) -> T {
    db::get_json(app, key)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

/// Everything the scheduler may deliver, soonest first — festivals, day plans,
/// Keeper and IPO reminders merged. Includes reminders that came due within
/// the late window, delivered or not: `deliver_due` checks `LastFired`, and
/// `upcoming` hides them from the UI.
pub fn pending(app: &AppHandle<Wry>) -> Vec<PlannedNotification> {
    let options: NotificationOptions = read(app, OPTIONS_KEY);
    let plans = crate::commands::plans::all_for_backup(app).unwrap_or_default();
    let now = Utc::now();

    let mut all = plan_day_plans(&plans, now);
    // Hiding Keeper in Settings silences it too; a module you turned off
    // shouldn't keep talking.
    if crate::background_refresh::enabled(app, prefs::KEEPER_ENABLED) {
        all.extend(crate::commands::keeper::pending_notifications(app, now));
    }
    all.extend(ipo_closing(app, options, now));
    // Bazar hidden in Settings silences SIP reminders too, as it does IPO ones.
    if crate::background_refresh::enabled(app, prefs::BAZAR_ENABLED) {
        all.extend(plan_sip_payments(
            &crate::commands::sips::plans(app),
            options,
            now,
        ));
    }

    // Festivals need the event list, which is only available inside the bundled
    // calendar range.
    if let Ok(today) = nepali_date_from(nepal_time::today()) {
        let events = upcoming::events(
            today,
            upcoming::DEFAULT_LIMIT,
            upcoming::DEFAULT_HORIZON_DAYS,
        );
        all.extend(plan_festivals(&events, options, now));
    }

    all.sort_by_key(|notification| notification.fire_at);
    all.truncate(sajilo_core::notify::LIMIT);
    all
}

/// Closing-day reminders from the cached IPO list. Planning never fetches; the
/// scheduler warms the list before each delivery instead.
fn ipo_closing(
    app: &AppHandle<Wry>,
    options: NotificationOptions,
    now: chrono::DateTime<Utc>,
) -> Vec<PlannedNotification> {
    if !wants_ipo_reminders(app, options) {
        return Vec::new();
    }
    let Some((snapshot, fetched_at)) = crate::commands::ipos::cached(app) else {
        return Vec::new();
    };
    let applied: Vec<String> = read(app, prefs::IPO_APPLIED);

    let deadlines: Vec<IpoDeadline> = snapshot
        .issues
        .iter()
        .filter(|issue| issue.open_to_public && !applied.contains(&issue.id))
        .filter_map(|issue| {
            let close_date = NaiveDate::parse_from_str(issue.close_date.trim(), "%Y-%m-%d").ok()?;
            let name = issue.symbol.clone().unwrap_or_else(|| {
                if issue.name.is_empty() {
                    issue.company_name.clone()
                } else {
                    issue.name.clone()
                }
            });
            Some(IpoDeadline { name, close_date })
        })
        .collect();

    plan_ipo_closing(&deadlines, options, fetched_at, now)
}

fn wants_ipo_reminders(app: &AppHandle<Wry>, options: NotificationOptions) -> bool {
    options.ipo_closing_day && crate::background_refresh::enabled(app, prefs::BAZAR_ENABLED)
}

/// A due closing-day reminder only goes out on a list fetched that day, so the
/// list is refreshed before every delivery. `Feed` still limits CDSC to one
/// request per half hour however often the scheduler wakes.
async fn warm_ipos(app: &AppHandle<Wry>) {
    let options: NotificationOptions = read(app, OPTIONS_KEY);
    if wants_ipo_reminders(app, options) {
        crate::commands::ipos::get_ipos(app.clone(), Some(false)).await;
    }
}

/// What is still to come, for the UI: `pending` without anything already
/// delivered.
pub fn upcoming(app: &AppHandle<Wry>) -> Vec<PlannedNotification> {
    let fired: LastFired = read(app, LAST_FIRED_KEY);
    pending(app)
        .into_iter()
        .filter(|notification| !fired.was_fired(&notification.id))
        .collect()
}

#[tauri::command]
pub fn pending_notifications(app: AppHandle<Wry>) -> Vec<PlannedNotification> {
    upcoming(&app)
}

/// How reminders arrive, for everything that shows one — Breaks included.
pub fn style(app: &AppHandle<Wry>) -> ReminderStyle {
    read::<NotificationOptions>(app, OPTIONS_KEY).style
}

#[tauri::command]
pub fn get_notification_options(app: AppHandle<Wry>) -> NotificationOptions {
    read(&app, OPTIONS_KEY)
}

/// Saving options replans immediately: a reminder switched on now should be
/// scheduled now, not at the next launch.
#[tauri::command]
pub fn set_notification_options(
    app: AppHandle<Wry>,
    options: NotificationOptions,
) -> Result<Vec<PlannedNotification>> {
    let value = serde_json::to_value(options).map_err(|error| error.to_string())?;
    db::set_json(&app, OPTIONS_KEY, &value)?;
    Ok(upcoming(&app))
}

/// Delivers anything whose time has come, and returns how many went out.
///
/// Called at startup and whenever the scheduler wakes. The `LastFired` record is
/// what makes it idempotent: restarting five times on a reminder day produces
/// exactly one notification.
pub fn deliver_due(app: &AppHandle<Wry>) -> usize {
    let now = Utc::now();
    let mut fired: LastFired = read(app, LAST_FIRED_KEY);
    let mut delivered = 0;
    let as_cards = style(app) == ReminderStyle::Card;
    let mut cards = Vec::new();

    for notification in pending(app) {
        if !should_fire_late(&notification, now, &fired) {
            continue;
        }
        if as_cards {
            // Queued is delivered: the card waits on screen until it is
            // dealt with, however long that takes.
            fired.record(&notification.id, now);
            delivered += 1;
            cards.push(notification);
            continue;
        }
        let result = app
            .notification()
            .builder()
            .title(&notification.title)
            .body(&notification.body)
            .show();

        match result {
            Ok(()) => {
                // Recorded only on success, so a failed delivery is retried on
                // the next wake rather than silently marked done.
                fired.record(&notification.id, now);
                delivered += 1;
            }
            Err(error) => tracing_warn(&notification.id, &error.to_string()),
        }
    }

    crate::commands::reminder_card::enqueue(app, cards);
    if delivered > 0 {
        fired.prune(now);
        if let Ok(value) = serde_json::to_value(&fired) {
            let _ = db::set_json(app, LAST_FIRED_KEY, &value);
        }
    }
    delivered
}

/// The desktop crate carries no logging framework, and one notification failing
/// is not worth adding it for.
fn tracing_warn(id: &str, message: &str) {
    eprintln!("sajilo: could not deliver {id}: {message}");
}

/// Sleeps until the next reminder is due rather than polling.
///
/// Recomputed on every wake, so it self-corrects after a laptop sleeps through a
/// fire time, and picks up plans added since it went to sleep.
pub fn spawn_scheduler(app: AppHandle<Wry>) {
    tauri::async_runtime::spawn(async move {
        // Anything missed while the app was closed, within the late window.
        warm_ipos(&app).await;
        deliver_due(&app);

        loop {
            let wait = next_wake(&pending(&app), Utc::now())
                // Nothing pending: check back hourly so a plan added elsewhere
                // is picked up without a restart.
                .map_or(3_600, |at| (at - Utc::now()).num_seconds().max(1) as u64)
                // And never sleep past an hour, so a preference change is
                // reflected within one cycle.
                .min(3_600);

            let handle = tauri::async_runtime::spawn_blocking(move || {
                std::thread::sleep(std::time::Duration::from_secs(wait));
            });
            if handle.await.is_err() {
                return;
            }
            warm_ipos(&app).await;
            deliver_due(&app);
        }
    });
}
