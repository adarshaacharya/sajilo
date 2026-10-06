//! The editorial notices that can appear on Sajilo's Today screen.
//!
//! Notices arrive in the signed `announcements` config pack, published by a
//! PR and served as a static file, so they cost nothing to serve however many
//! people run Sajilo. The announcements Worker still answers versions from
//! before the pack; this build never calls it.
//!
//! What this device shows is decided here, not in the web UI: a notice must be
//! live, meant for this platform and version, and not closed by the user. Urgent notices
//! cannot be closed, and each is also sent once as a system notification, for
//! people who rarely open the popover.

use chrono::{DateTime, Utc};
use sajilo_api::announcement::{
    Announcement, AnnouncementLevel, AnnouncementPlatform, AnnouncementResponse, AnnouncementsPack,
};
use sajilo_api::load_state::LoadState;
use sajilo_core::config::Pack;
use tauri::{AppHandle, Wry};
use tauri_plugin_notification::NotificationExt;

use crate::db;
use crate::prefs::{DISMISSED_ANNOUNCEMENTS_KEY, NOTIFIED_ANNOUNCEMENTS_KEY};

/// How many closed or announced ids are remembered. Far more than are ever
/// live at once, so a closed notice never comes back.
const REMEMBERED_IDS: usize = 50;
/// At most this many notices show at once, as the Worker capped them.
const MAX_LIVE: usize = 5;

/// The platform this build runs on.
fn this_platform() -> Option<AnnouncementPlatform> {
    if cfg!(target_os = "windows") {
        Some(AnnouncementPlatform::Windows)
    } else if cfg!(target_os = "macos") {
        Some(AnnouncementPlatform::Macos)
    } else if cfg!(target_os = "linux") {
        Some(AnnouncementPlatform::Linux)
    } else {
        None
    }
}

/// A plain `major.minor.patch` version, comparable as a tuple.
type Version = (u64, u64, u64);

fn parse_version(text: &str) -> Option<Version> {
    let mut parts = text.split('.').map(|part| part.parse::<u64>().ok());
    let version = (parts.next()??, parts.next()??, parts.next()??);
    parts.next().is_none().then_some(version)
}

/// This build's version.
fn this_version(app: &AppHandle<Wry>) -> Version {
    let version = &app.package_info().version;
    (version.major, version.minor, version.patch)
}

/// Whether `version` falls within a notice's bounds. A bound that does not
/// parse hides the notice: a mistyped target must not reach everyone.
fn in_versions(notice: &Announcement, version: Version) -> bool {
    let within = |bound: &Option<String>, allowed: fn(Version, Version) -> bool| {
        bound
            .as_deref()
            .is_none_or(|bound| parse_version(bound).is_some_and(|bound| allowed(version, bound)))
    };
    within(&notice.min_version, |version, min| version >= min)
        && within(&notice.max_version, |version, max| version <= max)
}

/// The notices this device shows: live now, for this platform and version,
/// not closed, most pressing first, at most [`MAX_LIVE`].
fn for_this_device(
    notices: Vec<Announcement>,
    platform: Option<AnnouncementPlatform>,
    version: Version,
    dismissed: &[String],
    now: DateTime<Utc>,
) -> Vec<Announcement> {
    let mut shown = notices
        .into_iter()
        .filter(|notice| notice.starts_at.is_none_or(|start| start <= now))
        .filter(|notice| notice.expires_at.is_none_or(|end| end > now))
        .filter(|notice| {
            notice.platforms.is_empty()
                || platform.is_some_and(|platform| notice.platforms.contains(&platform))
        })
        .filter(|notice| in_versions(notice, version))
        .filter(|notice| {
            notice.level == AnnouncementLevel::Urgent || !dismissed.contains(&notice.id)
        })
        .collect::<Vec<_>>();
    // Stable, so the pack's order holds within a level.
    shown.sort_by_key(|notice| rank(notice.level));
    shown.truncate(MAX_LIVE);
    shown
}

/// Urgent first, then important, then info; the pack's order within each.
const fn rank(level: AnnouncementLevel) -> u8 {
    match level {
        AnnouncementLevel::Urgent => 0,
        AnnouncementLevel::Important => 1,
        AnnouncementLevel::Info => 2,
    }
}

fn remembered(app: &AppHandle<Wry>, key: &str) -> Vec<String> {
    db::get_json(app, key)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

/// Adds `id` to a remembered list, newest last, keeping it short.
fn remember(app: &AppHandle<Wry>, key: &str, id: &str) {
    let mut ids = remembered(app, key);
    ids.retain(|known| known != id);
    ids.push(id.to_owned());
    let excess = ids.len().saturating_sub(REMEMBERED_IDS);
    ids.drain(..excess);
    if let Ok(value) = serde_json::to_value(ids) {
        let _ = db::set_json(app, key, &value);
    }
}

/// Sends each urgent notice once as a system notification, in the app's
/// language.
fn announce_urgent(app: &AppHandle<Wry>, notices: &[Announcement]) {
    let mut notified = remembered(app, NOTIFIED_ANNOUNCEMENTS_KEY);
    let nepali = crate::prefs::language(app) == sajilo_core::focus::Language::Ne;
    for notice in notices {
        if notice.level != AnnouncementLevel::Urgent || notified.contains(&notice.id) {
            continue;
        }
        let pick = |text: &sajilo_api::announcement::LocalizedText| {
            if nepali {
                text.ne.clone()
            } else {
                text.en.clone()
            }
        };
        let shown = app
            .notification()
            .builder()
            .title(pick(&notice.title))
            .body(pick(&notice.body))
            .show();
        if let Err(error) = shown {
            eprintln!("sajilo: could not deliver an urgent notice: {error}");
            continue;
        }
        remember(app, NOTIFIED_ANNOUNCEMENTS_KEY, &notice.id);
        notified.push(notice.id.clone());
    }
}

/// The notices to show now. `refresh` asks for a config check first; the
/// notices themselves are always the installed pack's, so this answers
/// offline too.
#[tauri::command]
pub async fn get_announcement(
    app: AppHandle<Wry>,
    refresh: Option<bool>,
) -> LoadState<AnnouncementResponse> {
    if refresh.unwrap_or(false) {
        crate::remote_config::refresh(&app, true).await;
    }
    let now = Utc::now();
    let dismissed = remembered(&app, DISMISSED_ANNOUNCEMENTS_KEY);
    let response = AnnouncementResponse {
        announcements: for_this_device(
            AnnouncementsPack::active().notices.clone(),
            this_platform(),
            this_version(&app),
            &dismissed,
            now,
        ),
    };
    announce_urgent(&app, &response.announcements);
    LoadState::Fresh(response)
}

/// Closes a notice for good. An urgent notice stays regardless: the filter
/// above ignores closing it, so it remains until it expires.
#[tauri::command]
pub fn dismiss_announcement(app: AppHandle<Wry>, id: String) {
    remember(&app, DISMISSED_ANNOUNCEMENTS_KEY, &id);
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use sajilo_api::announcement::LocalizedText;

    fn text(en: &str) -> LocalizedText {
        LocalizedText {
            en: en.to_owned(),
            ne: en.to_owned(),
        }
    }

    fn notice(id: &str, level: AnnouncementLevel) -> Announcement {
        Announcement {
            id: id.to_owned(),
            level,
            title: text(id),
            body: text(id),
            starts_at: None,
            expires_at: None,
            action: None,
            platforms: Vec::new(),
            min_version: None,
            max_version: None,
        }
    }

    const VERSION: Version = (0, 1, 33);

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 9, 25, 12, 0, 0).unwrap()
    }

    fn ids(notices: &[Announcement]) -> Vec<&str> {
        notices.iter().map(|notice| notice.id.as_str()).collect()
    }

    #[test]
    fn a_notice_for_another_platform_is_not_shown() {
        let mut windows = notice("windows", AnnouncementLevel::Info);
        windows.platforms = vec![AnnouncementPlatform::Windows];
        let mut desktops = notice("mac-and-linux", AnnouncementLevel::Info);
        desktops.platforms = vec![AnnouncementPlatform::Macos, AnnouncementPlatform::Linux];
        let everyone = notice("everyone", AnnouncementLevel::Info);
        let all = vec![windows, desktops, everyone];

        let on_linux = for_this_device(
            all.clone(),
            Some(AnnouncementPlatform::Linux),
            VERSION,
            &[],
            now(),
        );
        assert_eq!(ids(&on_linux), ["mac-and-linux", "everyone"]);
        let on_windows = for_this_device(
            all,
            Some(AnnouncementPlatform::Windows),
            VERSION,
            &[],
            now(),
        );
        assert_eq!(ids(&on_windows), ["windows", "everyone"]);
    }

    #[test]
    fn a_closed_notice_stays_closed_but_an_urgent_one_cannot_be_closed() {
        let all = vec![
            notice("info", AnnouncementLevel::Info),
            notice("urgent", AnnouncementLevel::Urgent),
        ];
        let closed = vec!["info".to_owned(), "urgent".to_owned()];
        let shown = for_this_device(all, None, VERSION, &closed, now());
        assert_eq!(ids(&shown), ["urgent"]);
    }

    #[test]
    fn a_cached_notice_past_its_expiry_is_not_shown_offline() {
        let mut expired = notice("expired", AnnouncementLevel::Info);
        expired.expires_at = Some(now() - chrono::Duration::minutes(1));
        let mut early = notice("not-yet", AnnouncementLevel::Info);
        early.starts_at = Some(now() + chrono::Duration::minutes(1));
        let live = notice("live", AnnouncementLevel::Info);
        let shown = for_this_device(vec![expired, early, live], None, VERSION, &[], now());
        assert_eq!(ids(&shown), ["live"]);
    }

    #[test]
    fn a_notice_reaches_only_the_versions_it_names() {
        let bounded = |id: &str, min: Option<&str>, max: Option<&str>| {
            let mut bounded = notice(id, AnnouncementLevel::Info);
            bounded.min_version = min.map(str::to_owned);
            bounded.max_version = max.map(str::to_owned);
            bounded
        };
        let all = vec![
            bounded("before-fix", None, Some("0.1.32")),
            bounded("up-to-this", None, Some("0.1.33")),
            bounded("exactly-this", Some("0.1.33"), Some("0.1.33")),
            bounded("from-next", Some("0.1.34"), None),
            bounded("minor-not-string-order", Some("0.1.9"), None),
            bounded("mistyped", None, Some("v0.1.40")),
            bounded("everyone", None, None),
        ];
        let shown = for_this_device(all, None, VERSION, &[], now());
        assert_eq!(
            ids(&shown),
            [
                "up-to-this",
                "exactly-this",
                "minor-not-string-order",
                "everyone"
            ]
        );
    }

    /// The Worker also sends `announcement` for versions before the list; the
    /// current app must read past it.
    #[test]
    fn the_response_reads_the_list_and_ignores_the_single_field_for_old_versions() {
        let raw = r#"{
            "announcement": {"id": "update", "level": "info",
                "title": {"en": "Update", "ne": "अपडेट"},
                "body": {"en": "Update", "ne": "अपडेट"}},
            "announcements": [{"id": "ipo", "level": "important",
                "title": {"en": "IPO", "ne": "आईपीओ"},
                "body": {"en": "Open", "ne": "खुला"},
                "platforms": ["windows"]}]
        }"#;
        let response: AnnouncementResponse = serde_json::from_str(raw).unwrap();
        assert_eq!(ids(&response.announcements), ["ipo"]);
        assert_eq!(
            response.announcements[0].platforms,
            [AnnouncementPlatform::Windows]
        );
    }
}
