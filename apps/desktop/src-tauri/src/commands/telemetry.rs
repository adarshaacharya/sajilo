//! Anonymous, aggregate-only daily count.
//!
//! On by default; switching it off in Settings stops it entirely. The desktop
//! app owns that switch and daily de-duplication. The endpoint only receives a
//! small aggregate bucket; it never sees an account, installation identifier,
//! local data, or usage events.

use std::sync::atomic::{AtomicBool, Ordering};

use chrono::NaiveDate;
use serde::Serialize;
use serde_json::{Value, json};
use tauri::{AppHandle, Wry};

use crate::{db, prefs};

const ENDPOINT: &str = "https://sajilo-telemetry.adarshx.workers.dev/v1/ping";
const SOURCE_NAME: &str = "Sajilo usage insights";
const MAX_GAP_DAYS: i64 = 45;
static USAGE_PING_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UsagePing {
    version: &'static str,
    platform: &'static str,
    architecture: &'static str,
    /// The Nepal day this install de-duplicated against. The endpoint files the
    /// count under it, so a ping sent just before midnight is not counted again
    /// the next day.
    day_npt: String,
    gap_days: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    upgraded_from_version: Option<String>,
}

/// "other" is still a count: a build for an unplanned target is in use too.
fn platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "macos",
        "windows" => "windows",
        "linux" => "linux",
        _ => "other",
    }
}

fn architecture() -> &'static str {
    match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        _ => "other",
    }
}

fn gap_days(previous_day: Option<&str>, today: NaiveDate) -> i64 {
    let Some(previous_day) = previous_day else {
        return 0;
    };
    let Some(previous_day) = NaiveDate::parse_from_str(previous_day, "%Y-%m-%d").ok() else {
        return 0;
    };
    (today - previous_day).num_days().clamp(1, MAX_GAP_DAYS)
}

/// A missing preference is a count nobody switched off.
fn is_enabled(saved: Option<bool>) -> bool {
    saved.unwrap_or(true)
}

fn read(app: &AppHandle<Wry>, key: &str) -> Option<Value> {
    db::get_json(app, key).ok().flatten()
}

fn enabled(app: &AppHandle<Wry>) -> bool {
    is_enabled(read(app, prefs::USAGE_INSIGHTS_ENABLED).and_then(|value| value.as_bool()))
}

fn read_string(app: &AppHandle<Wry>, key: &str) -> Option<String> {
    read(app, key).and_then(|value| value.as_str().map(str::to_owned))
}

/// Sends at most one event per Nepal calendar day, unless switched off. Failed
/// requests leave the local marker untouched so the next hourly background
/// refresh can try again.
pub async fn send_usage_ping(app: AppHandle<Wry>) -> bool {
    // A Settings toggle and the hourly background refresh can overlap. The
    // second caller leaves immediately, so only one can read, send and mark a
    // day at a time.
    if USAGE_PING_IN_FLIGHT
        .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
        .is_err()
    {
        return false;
    }

    let sent = send_usage_ping_inner(app).await;
    USAGE_PING_IN_FLIGHT.store(false, Ordering::Release);
    sent
}

async fn send_usage_ping_inner(app: AppHandle<Wry>) -> bool {
    if !enabled(&app) {
        return false;
    }

    let today = sajilo_core::nepal_time::today();
    let today_text = today.format("%Y-%m-%d").to_string();
    let previous_day = read_string(&app, prefs::USAGE_INSIGHTS_LAST_PING_DAY);
    if previous_day.as_deref() == Some(today_text.as_str()) {
        return false;
    }

    let version = env!("CARGO_PKG_VERSION");
    let previous_version = read_string(&app, prefs::USAGE_INSIGHTS_LAST_PING_VERSION);
    let payload = UsagePing {
        version,
        platform: platform(),
        architecture: architecture(),
        day_npt: today_text.clone(),
        gap_days: gap_days(previous_day.as_deref(), today),
        upgraded_from_version: previous_version.filter(|previous| previous != version),
    };

    if sajilo_providers::HttpClient::new()
        .post_json(SOURCE_NAME, ENDPOINT, &payload)
        .await
        .is_err()
    {
        return false;
    }

    let _ = db::set_json(
        &app,
        prefs::USAGE_INSIGHTS_LAST_PING_DAY,
        &json!(today_text),
    );
    let _ = db::set_json(
        &app,
        prefs::USAGE_INSIGHTS_LAST_PING_VERSION,
        &json!(version),
    );
    true
}

#[tauri::command]
pub fn usage_insights_enabled(app: AppHandle<Wry>) -> bool {
    enabled(&app)
}

#[tauri::command]
pub async fn set_usage_insights_enabled(app: AppHandle<Wry>, enabled: bool) -> db::Result<bool> {
    db::set_json(&app, prefs::USAGE_INSIGHTS_ENABLED, &json!(enabled))?;
    Ok(enabled && send_usage_ping(app).await)
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;

    use super::{UsagePing, gap_days, is_enabled};

    #[test]
    fn caps_and_normalizes_the_gap() {
        let today = NaiveDate::from_ymd_opt(2026, 9, 14).unwrap();
        assert_eq!(gap_days(None, today), 0);
        assert_eq!(gap_days(Some("2026-09-13"), today), 1);
        assert_eq!(gap_days(Some("2026-07-01"), today), 45);
        assert_eq!(gap_days(Some("not-a-date"), today), 0);
    }

    #[test]
    fn is_on_by_default_and_off_means_off() {
        assert!(is_enabled(None));
        assert!(is_enabled(Some(true)));
        assert!(!is_enabled(Some(false)));
    }

    #[test]
    fn omits_an_unknown_previous_version_from_the_payload() {
        let payload = UsagePing {
            version: "0.1.23",
            platform: "macos",
            architecture: "arm64",
            day_npt: "2026-09-14".to_owned(),
            gap_days: 0,
            upgraded_from_version: None,
        };
        let json = serde_json::to_value(payload).unwrap();
        assert!(json.get("upgradedFromVersion").is_none());
        assert_eq!(json["dayNpt"], "2026-09-14");
    }
}
