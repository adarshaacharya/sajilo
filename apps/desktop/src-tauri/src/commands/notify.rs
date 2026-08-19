//! Scheduling the reminders `sajilo-core` planned.
//!
//! The planning rules live in core and are tested there. This file owns only the
//! parts that need the platform: asking permission, delivering a notification,
//! and remembering what has already been delivered so a restart cannot re-fire
//! it.

use chrono::Utc;
use sajilo_core::calendar::bikram_sambat::nepali_date_from;
use sajilo_core::calendar::upcoming;
use sajilo_core::nepal_time;
use sajilo_core::notify::{
    LastFired, NotificationOptions, PlannedNotification, next_wake, plan_day_plans, plan_festivals,
    should_fire_late,
};
use sajilo_core::planner::DayPlan;
use tauri::{AppHandle, Wry};
use tauri_plugin_notification::{NotificationExt, PermissionState};
use tauri_plugin_store::StoreExt;

use crate::prefs::{NOTIFICATION_OPTIONS as OPTIONS_KEY, PLANS_KEY, STORE_FILE};

const LAST_FIRED_KEY: &str = "lastFired.v1";

type Result<T> = std::result::Result<T, String>;

/// Permission is requested only when the user switches a reminder on — never at
/// launch, and never for a feature nobody asked for.
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
    app.store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(key))
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

/// Everything currently pending, soonest first — festivals and day plans merged.
pub fn pending(app: &AppHandle<Wry>) -> Vec<PlannedNotification> {
    let options: NotificationOptions = read(app, OPTIONS_KEY);
    let plans: Vec<DayPlan> = read(app, PLANS_KEY);
    let now = Utc::now();

    let mut all = plan_day_plans(&plans, now);

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
    all
}

#[tauri::command]
pub fn pending_notifications(app: AppHandle<Wry>) -> Vec<PlannedNotification> {
    pending(&app)
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
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(
        OPTIONS_KEY,
        serde_json::to_value(options).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    Ok(pending(&app))
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

    for notification in pending(app) {
        if !should_fire_late(&notification, now, &fired) {
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

    if delivered > 0 {
        fired.prune(now);
        if let Ok(store) = app.store(STORE_FILE)
            && let Ok(value) = serde_json::to_value(&fired)
        {
            store.set(LAST_FIRED_KEY, value);
            let _ = store.save();
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
            deliver_due(&app);
        }
    });
}
