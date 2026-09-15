//! Anonymous, aggregate-only daily count.
//!
//! On by default; switching it off in Settings stops it entirely. The desktop
//! app owns that switch and daily de-duplication. The endpoint only receives a
//! small aggregate bucket; it never sees an account, installation identifier,
//! local data, or usage events.

use std::sync::atomic::{AtomicBool, Ordering};

use chrono::{NaiveDate, Utc};
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
    version: String,
    platform: &'static str,
    architecture: &'static str,
    /// The UTC day this install de-duplicated against. The endpoint files the
    /// count under it, so a ping sent just before midnight is not counted again
    /// the next day.
    day_utc: String,
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

/// Whether this UTC day has already been counted.
///
/// Builds up to 0.1.24 stored the Nepal date, which runs up to a day ahead of
/// UTC: from 18:15 UTC it is already tomorrow in Kathmandu. A stored day up to
/// one day ahead therefore means "sent", so moving to UTC never counts an
/// install twice on the day it updates — at worst it skips that one day.
fn already_counted(previous_day: Option<&str>, today: NaiveDate) -> bool {
    previous_day
        .and_then(|day| NaiveDate::parse_from_str(day, "%Y-%m-%d").ok())
        .is_some_and(|day| (0..=1).contains(&(day - today).num_days()))
}

/// The version this install last reported, when it differs from the running
/// one — i.e. the version it upgraded from.
///
/// Builds up to 0.1.24 reported `CARGO_PKG_VERSION`, the workspace crate
/// version, which never moved off its placeholder while the app version in
/// `tauri.conf.json` climbed. No app release that old ever sent a ping, so a
/// stored placeholder is that bug's marker, not a real version: reporting it
/// would file every existing install under "upgraded from 0.1.0".
fn upgraded_from(previous: Option<String>, current: &str) -> Option<String> {
    previous.filter(|previous| previous != current && previous != env!("CARGO_PKG_VERSION"))
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

/// Sends at most one event per UTC day, unless switched off. Failed
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

    let today = Utc::now().date_naive();
    let today_text = today.format("%Y-%m-%d").to_string();
    let previous_day = read_string(&app, prefs::USAGE_INSIGHTS_LAST_PING_DAY);
    if already_counted(previous_day.as_deref(), today) {
        return false;
    }

    // The app's version, from `tauri.conf.json` — the one releases bump and the
    // updater compares. `CARGO_PKG_VERSION` is the workspace crate version and
    // does not follow releases.
    let version = app.package_info().version.to_string();
    let previous_version = read_string(&app, prefs::USAGE_INSIGHTS_LAST_PING_VERSION);
    let payload = UsagePing {
        version: version.clone(),
        platform: platform(),
        architecture: architecture(),
        day_utc: today_text.clone(),
        gap_days: gap_days(previous_day.as_deref(), today),
        upgraded_from_version: upgraded_from(previous_version, &version),
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

    use super::{UsagePing, already_counted, gap_days, is_enabled, upgraded_from};

    #[test]
    fn counts_each_utc_day_once_across_the_switch_from_nepal_days() {
        let today = NaiveDate::from_ymd_opt(2026, 9, 15).unwrap();
        assert!(!already_counted(None, today));
        assert!(!already_counted(Some("2026-09-14"), today));
        assert!(already_counted(Some("2026-09-15"), today));
        // A Nepal date stored after 18:15 UTC is a day ahead: already sent.
        assert!(already_counted(Some("2026-09-16"), today));
        assert!(!already_counted(Some("2026-09-20"), today));
        assert!(!already_counted(Some("not-a-date"), today));
    }

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
    fn reports_a_real_upgrade_only() {
        assert_eq!(upgraded_from(None, "0.1.25"), None);
        assert_eq!(upgraded_from(Some("0.1.25".to_owned()), "0.1.25"), None);
        assert_eq!(
            upgraded_from(Some("0.1.24".to_owned()), "0.1.25"),
            Some("0.1.24".to_owned())
        );
        // What builds up to 0.1.24 stored: the crate placeholder, not a release.
        assert_eq!(
            upgraded_from(Some(env!("CARGO_PKG_VERSION").to_owned()), "0.1.25"),
            None
        );
    }

    #[test]
    fn omits_an_unknown_previous_version_from_the_payload() {
        let payload = UsagePing {
            version: "0.1.23".to_owned(),
            platform: "macos",
            architecture: "arm64",
            day_utc: "2026-09-14".to_owned(),
            gap_days: 0,
            upgraded_from_version: None,
        };
        let json = serde_json::to_value(payload).unwrap();
        assert!(json.get("upgradedFromVersion").is_none());
        assert_eq!(json["dayUtc"], "2026-09-14");
    }
}
