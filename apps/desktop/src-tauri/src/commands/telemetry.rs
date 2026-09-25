//! Anonymous daily count, and which features were used.
//!
//! On by default; switching it off in Settings stops it entirely, and nothing
//! is even counted locally while it is off. The desktop app owns that switch
//! and daily de-duplication. The endpoint receives a small bucket — version,
//! platform, architecture, day — plus a random id this install generates for
//! itself, so returning installs can be told apart from new ones.
//!
//! From 0.1.29 it also receives how many times each feature was used since the
//! last report — screens opened, tabs picked, a handful of actions, all names
//! from [`EVENTS`] and nothing else — and a few display choices (language,
//! digits, theme, text size, reminder style, which modules are on). It never
//! sees an account, a name, anything about the machine, anything typed,
//! searched or saved, which story was read or which station played.
//!
//! The id is a v4 uuid: random, not derived from hardware, and never sent once
//! the count is switched off. Builds before 0.1.28 send no id at all and are
//! still counted, so the endpoint must keep treating it as optional.

use std::collections::BTreeMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use chrono::{NaiveDate, Utc};
use serde::Serialize;
use serde_json::{Value, json};
use tauri::{AppHandle, Wry};
use uuid::Uuid;

use crate::{db, prefs};

const ENDPOINT: &str = "https://sajilo-telemetry.adarshx.workers.dev/v1/ping";
const SOURCE_NAME: &str = "Sajilo usage insights";
const MAX_GAP_DAYS: i64 = 45;
static USAGE_PING_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

/// Every event the app may count. A name not listed is dropped before it is
/// stored, so this list is the whole of what can leave the machine: names of
/// screens, tabs and actions, never anything a person typed or chose.
pub const EVENTS: &[&str] = &[
    // Screens, as each is opened.
    "screen.today",
    "screen.news",
    "screen.news-government",
    "screen.bazar",
    "screen.rashifal",
    "screen.radio",
    "screen.tools",
    "screen.focus",
    "screen.keeper",
    "screen.settings",
    "screen.weather",
    "screen.events",
    "screen.converter",
    "screen.day",
    // Tabs inside a screen.
    "tab.bazar.stocks",
    "tab.bazar.forex",
    "tab.bazar.metals",
    "tab.bazar.fuel",
    "tab.bazar.vegetables",
    "tab.tools.emergency",
    "tab.tools.clock",
    "tab.tools.date",
    "tab.tools.land",
    "tab.tools.weight",
    "tab.tools.vat",
    "tab.tools.interest",
    // Things done.
    "action.popover-open",
    "action.date-convert",
    "action.radio-play",
    "action.rashi-pick",
    "action.news-open",
    "action.keeper-save",
    "action.plan-save",
    "action.setup-done",
    "action.focus-on",
    "action.focus-off",
    "action.break-done",
    "action.break-snooze",
    "action.break-skip",
    "action.reminder-open",
    "action.reminder-dismiss",
];

/// Counts since the last report that got through, by event name.
const EVENTS_KEY: &str = "usageInsights.events";
/// A day of heavy use is still a count, not an overflow.
const MAX_EVENT_COUNT: u32 = 100_000;
/// Read-modify-write on the stored counts from a command and from the send
/// path must not interleave, or a count is lost.
static EVENTS_LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UsagePing {
    /// This install's random id. See `prefs::USAGE_INSIGHTS_INSTALL_ID`.
    install_id: String,
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
    /// Uses of each feature since the last report. See [`EVENTS`].
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    events: BTreeMap<String, u32>,
    /// A few display choices, each a short word. See [`settings_snapshot`].
    settings: BTreeMap<&'static str, String>,
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

/// A stored id that this build is willing to send.
///
/// Anything that is not a plain v4 uuid — a hand-edited preference, a value
/// from some future format — is discarded rather than forwarded, so the only
/// thing that can ever leave here is a random number this app generated.
fn valid_install_id(stored: Option<String>) -> Option<String> {
    stored.filter(|id| {
        Uuid::try_parse(id).is_ok_and(|uuid| uuid.get_version_num() == 4) && id.len() == 36
    })
}

/// This install's id, minted on first use and then kept.
///
/// Deliberately called from the send path and nowhere else, so an install whose
/// owner switched the count off before it ever ran never generates one at all.
///
/// Kept — not deleted — when the count is switched off. While it is off nothing
/// is sent, so the id tracks nothing; it simply waits in the local database. A
/// fresh one on every switch-back-on would file the same person as a new
/// install each time, which makes someone toggling the setting look like
/// several users. Nothing else replaces it: the switch is the control, and a
/// second one that silently forks the counts would only blur them.
fn install_id(app: &AppHandle<Wry>) -> String {
    if let Some(existing) = valid_install_id(read_string(app, prefs::USAGE_INSIGHTS_INSTALL_ID)) {
        return existing;
    }
    let minted = Uuid::new_v4().to_string();
    let _ = db::set_json(app, prefs::USAGE_INSIGHTS_INSTALL_ID, &json!(minted));
    minted
}

fn read_events(app: &AppHandle<Wry>) -> BTreeMap<String, u32> {
    read(app, EVENTS_KEY)
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

/// Counts one use of a feature, if the count is on and the name is one of
/// [`EVENTS`]. Stored locally until the next daily report takes it.
pub fn record(app: &AppHandle<Wry>, event: &str) {
    if !EVENTS.contains(&event) || !enabled(app) {
        return;
    }
    let _guard = EVENTS_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let mut events = read_events(app);
    let count = events.entry(event.to_owned()).or_insert(0);
    *count = count.saturating_add(1).min(MAX_EVENT_COUNT);
    if let Ok(value) = serde_json::to_value(&events) {
        let _ = db::set_json(app, EVENTS_KEY, &value);
    }
}

/// Takes what a report that got through carried off the stored counts, and
/// keeps anything counted while it was on its way.
fn subtract_sent(app: &AppHandle<Wry>, sent: &BTreeMap<String, u32>) {
    let _guard = EVENTS_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let mut events = read_events(app);
    remove_sent(&mut events, sent);
    if let Ok(value) = serde_json::to_value(&events) {
        let _ = db::set_json(app, EVENTS_KEY, &value);
    }
}

fn remove_sent(events: &mut BTreeMap<String, u32>, sent: &BTreeMap<String, u32>) {
    for (name, count) in sent {
        if let Some(left) = events.get_mut(name) {
            *left = left.saturating_sub(*count);
        }
    }
    events.retain(|_, count| *count > 0);
}

/// Only the counts this build may send: a stored name that is no longer in
/// [`EVENTS`] stays home.
fn sendable(events: BTreeMap<String, u32>) -> BTreeMap<String, u32> {
    events
        .into_iter()
        .filter(|(name, count)| EVENTS.contains(&name.as_str()) && *count > 0)
        .collect()
}

#[tauri::command]
pub fn record_usage(app: AppHandle<Wry>, event: String) {
    record(&app, &event);
}

/// A stored preference as one of the words it may be, or its default.
fn choice(app: &AppHandle<Wry>, key: &str, allowed: &[&str], default: &str) -> String {
    read_string(app, key)
        .filter(|value| allowed.contains(&value.as_str()))
        .unwrap_or_else(|| default.to_owned())
}

/// The display choices sent with the count: which language and digits people
/// read in, and what they switch off. Every value is one of a few fixed words.
fn settings_snapshot(app: &AppHandle<Wry>) -> BTreeMap<&'static str, String> {
    let on_off = |key: &str, default: bool| {
        let on = read(app, key)
            .and_then(|value| value.as_bool())
            .unwrap_or(default);
        (if on { "on" } else { "off" }).to_owned()
    };
    let reminder_style = match crate::commands::notify::style(app) {
        sajilo_core::focus::ReminderStyle::Card => "card",
        sajilo_core::focus::ReminderStyle::Notification => "notification",
    };
    BTreeMap::from([
        (
            "language",
            choice(app, prefs::LANGUAGE, &["en", "ne"], "en"),
        ),
        (
            "numerals",
            choice(
                app,
                prefs::NUMERAL_STYLE,
                &["latin", "devanagari"],
                "devanagari",
            ),
        ),
        (
            "theme",
            choice(app, "theme", &["system", "light", "dark"], "system"),
        ),
        (
            "textSize",
            choice(app, "textSize", &["small", "default", "large"], "default"),
        ),
        ("reminderStyle", reminder_style.to_owned()),
        ("weather", on_off(prefs::WEATHER_ENABLED, true)),
        ("forex", on_off(prefs::FOREX_ENABLED, true)),
        ("news", on_off(prefs::NEWS_ENABLED, true)),
        ("bazar", on_off(prefs::BAZAR_ENABLED, true)),
        ("rashifal", on_off(prefs::RASHIFAL_ENABLED, true)),
        ("radio", on_off(prefs::RADIO_ENABLED, true)),
        ("keeper", on_off(prefs::KEEPER_ENABLED, true)),
        ("focus", on_off(prefs::FOCUS_ENABLED, true)),
        ("clocks", on_off("clocksEnabled", false)),
    ])
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
    let events = {
        let _guard = EVENTS_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        sendable(read_events(&app))
    };
    let payload = UsagePing {
        install_id: install_id(&app),
        version: version.clone(),
        platform: platform(),
        architecture: architecture(),
        day_utc: today_text.clone(),
        gap_days: gap_days(previous_day.as_deref(), today),
        upgraded_from_version: upgraded_from(previous_version, &version),
        events,
        settings: settings_snapshot(&app),
    };

    if sajilo_providers::HttpClient::new()
        .post_json(SOURCE_NAME, ENDPOINT, &payload)
        .await
        .is_err()
    {
        return false;
    }

    subtract_sent(&app, &payload.events);
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
    if !enabled {
        // Switching off means nothing waits to be sent later either.
        let _guard = EVENTS_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let _ = db::delete_json(&app, EVENTS_KEY);
    }
    // The id is left alone. Switching off already stops everything being sent;
    // deleting it as well would only mean that switching back on reports a new
    // install, counting one undecided person several times. `install_id` has
    // the reasoning.
    Ok(enabled && send_usage_ping(app).await)
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;

    use std::collections::BTreeMap;

    use super::{
        EVENTS, UsagePing, already_counted, gap_days, is_enabled, remove_sent, sendable,
        upgraded_from, valid_install_id,
    };

    #[test]
    fn only_forwards_a_random_v4_id() {
        let generated = uuid::Uuid::new_v4().to_string();
        assert_eq!(valid_install_id(Some(generated.clone())), Some(generated));
        assert_eq!(valid_install_id(None), None);
        assert_eq!(valid_install_id(Some(String::new())), None);
        assert_eq!(valid_install_id(Some("adarshaofficial".to_owned())), None);
        // A v1 uuid carries a MAC address and a timestamp. Never forwarded,
        // however it got into the preference.
        assert_eq!(
            valid_install_id(Some("2c5ea4c0-4067-11e9-8bad-9b1deb4d3b7d".to_owned())),
            None
        );
    }

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
            install_id: "3f8c1b60-2a9d-4c7e-9f01-5b6d8e2a4c13".to_owned(),
            version: "0.1.23".to_owned(),
            platform: "macos",
            architecture: "arm64",
            day_utc: "2026-09-14".to_owned(),
            gap_days: 0,
            upgraded_from_version: None,
            events: BTreeMap::new(),
            settings: BTreeMap::new(),
        };
        let json = serde_json::to_value(payload).unwrap();
        assert!(json.get("upgradedFromVersion").is_none());
        assert!(json.get("events").is_none(), "no events, no field");
        assert_eq!(json["dayUtc"], "2026-09-14");
    }

    #[test]
    fn event_names_are_short_fixed_words() {
        let pattern = |name: &str| {
            let mut parts = name.split('.');
            let kind = parts.next().unwrap_or_default();
            ["screen", "tab", "action"].contains(&kind)
                && name.len() <= 48
                && name
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '-')
        };
        for name in EVENTS {
            assert!(pattern(name), "{name} must match what the endpoint accepts");
        }
        let mut unique = EVENTS.to_vec();
        unique.sort_unstable();
        unique.dedup();
        assert_eq!(unique.len(), EVENTS.len(), "no duplicates");
    }

    #[test]
    fn only_listed_events_are_sent() {
        let stored = BTreeMap::from([
            ("screen.news".to_owned(), 3),
            ("something-typed".to_owned(), 1),
            ("action.radio-play".to_owned(), 0),
        ]);
        assert_eq!(
            sendable(stored),
            BTreeMap::from([("screen.news".to_owned(), 3)])
        );
    }

    #[test]
    fn keeps_what_was_counted_while_a_report_was_sending() {
        let mut stored = BTreeMap::from([
            ("screen.news".to_owned(), 5),
            ("screen.bazar".to_owned(), 2),
        ]);
        let sent = BTreeMap::from([
            ("screen.news".to_owned(), 3),
            ("screen.bazar".to_owned(), 2),
        ]);
        remove_sent(&mut stored, &sent);
        assert_eq!(stored, BTreeMap::from([("screen.news".to_owned(), 2)]));
    }
}
