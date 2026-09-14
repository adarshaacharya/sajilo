//! Opt-in, aggregate-only usage insights.
//!
//! The desktop app owns consent and daily de-duplication. The endpoint only
//! receives a small aggregate bucket; it never sees an account, installation
//! identifier, local data, or usage events.

use chrono::NaiveDate;
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Wry};

use crate::{db, prefs};

const ENDPOINT: &str = "https://sajilo-telemetry.adarshx.workers.dev/v1/ping";
const SOURCE_NAME: &str = "Sajilo usage insights";
const MAX_GAP_DAYS: i64 = 45;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UsagePing {
    version: &'static str,
    platform: &'static str,
    architecture: &'static str,
    gap_days: i64,
    upgraded_from_version: Option<String>,
}

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

/// Sends at most one event per Nepal calendar day, and only after explicit
/// opt-in. Failed requests leave the local marker untouched so the next hourly
/// background refresh can try again.
pub async fn send_usage_ping(app: AppHandle<Wry>) -> bool {
    let enabled = db::get_json(&app, prefs::USAGE_INSIGHTS_ENABLED)
        .ok()
        .flatten()
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    if !enabled {
        return false;
    }

    let today = sajilo_core::nepal_time::today();
    let today_text = today.format("%Y-%m-%d").to_string();
    let previous_day = db::get_json(&app, prefs::USAGE_INSIGHTS_LAST_PING_DAY)
        .ok()
        .flatten()
        .and_then(|value| value.as_str().map(str::to_owned));
    if previous_day.as_deref() == Some(today_text.as_str()) {
        return false;
    }

    let version = env!("CARGO_PKG_VERSION");
    let previous_version = db::get_json(&app, prefs::USAGE_INSIGHTS_LAST_PING_VERSION)
        .ok()
        .flatten()
        .and_then(|value| value.as_str().map(str::to_owned));
    let payload = UsagePing {
        version,
        platform: platform(),
        architecture: architecture(),
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
pub async fn send_usage_ping_now(app: AppHandle<Wry>) -> bool {
    send_usage_ping(app).await
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;

    use super::gap_days;

    #[test]
    fn caps_and_normalizes_the_gap() {
        let today = NaiveDate::from_ymd_opt(2026, 9, 14).unwrap();
        assert_eq!(gap_days(None, today), 0);
        assert_eq!(gap_days(Some("2026-09-13"), today), 1);
        assert_eq!(gap_days(Some("2026-07-01"), today), 45);
        assert_eq!(gap_days(Some("not-a-date"), today), 0);
    }
}
