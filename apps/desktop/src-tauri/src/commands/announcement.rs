//! The editorial notices that can appear on Sajilo's Today screen.
//!
//! The public Worker is the only network hop. The client caches both the live
//! notices and the deliberate "nothing to show" response, so an expired notice
//! disappears cleanly and an offline launch never invents a new one.
//!
//! What this device shows is decided here, not in the web UI: a notice must be
//! live, meant for this platform, and not closed by the user. Urgent notices
//! cannot be closed, and each is also sent once as a system notification, for
//! people who rarely open the popover.

use chrono::{DateTime, Utc};
use sajilo_api::announcement::{
    Announcement, AnnouncementLevel, AnnouncementPlatform, AnnouncementResponse,
};
use sajilo_api::load_state::LoadState;
use sajilo_providers::{HttpClient, ProviderError};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_notification::NotificationExt;

use crate::db;
use crate::feed::Feed;
use crate::prefs::{ANNOUNCEMENT_KEY, DISMISSED_ANNOUNCEMENTS_KEY, NOTIFIED_ANNOUNCEMENTS_KEY};

pub const ANNOUNCEMENT_ENDPOINT: &str =
    "https://sajilo-announcements.adarshx.workers.dev/v1/announcement";

const MAX_AGE_SECS: i64 = 2 * 60 * 60;
const REFETCH_AFTER_SECS: i64 = 30 * 60;
const SOURCE_NAME: &str = "Sajilo announcements";
/// How many closed or announced ids are remembered. Far more than are ever
/// live at once, so a closed notice never comes back.
const REMEMBERED_IDS: usize = 50;

pub struct AnnouncementCache {
    feed: Feed<AnnouncementResponse>,
    client: HttpClient,
}

impl Default for AnnouncementCache {
    fn default() -> Self {
        Self {
            feed: Feed::new(ANNOUNCEMENT_KEY, MAX_AGE_SECS, REFETCH_AFTER_SECS),
            client: HttpClient::new(),
        }
    }
}

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

/// The notices this device shows, in the Worker's order.
///
/// Time is checked again here even though the Worker already filters by it:
/// a cached list can outlive a notice's expiry while the computer is offline.
fn for_this_device(
    notices: Vec<Announcement>,
    platform: Option<AnnouncementPlatform>,
    dismissed: &[String],
    now: DateTime<Utc>,
) -> Vec<Announcement> {
    notices
        .into_iter()
        .filter(|notice| notice.starts_at.is_none_or(|start| start <= now))
        .filter(|notice| notice.expires_at.is_none_or(|end| end > now))
        .filter(|notice| {
            notice.platforms.is_empty()
                || platform.is_some_and(|platform| notice.platforms.contains(&platform))
        })
        .filter(|notice| {
            notice.level == AnnouncementLevel::Urgent || !dismissed.contains(&notice.id)
        })
        .collect()
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

#[tauri::command]
pub async fn get_announcement(
    app: AppHandle<Wry>,
    refresh: Option<bool>,
) -> LoadState<AnnouncementResponse> {
    let cache = app.state::<AnnouncementCache>();
    let client = &cache.client;
    let now = Utc::now();

    let state = cache
        .feed
        .get(&app, now, refresh.unwrap_or(false), || async move {
            let raw = client.get_text(SOURCE_NAME, ANNOUNCEMENT_ENDPOINT).await?;
            serde_json::from_str(&raw)
                .map_err(|error| ProviderError::parse(SOURCE_NAME, error.to_string()))
        })
        .await;

    let dismissed = remembered(&app, DISMISSED_ANNOUNCEMENTS_KEY);
    let state = state.map(|response| AnnouncementResponse {
        announcements: for_this_device(response.announcements, this_platform(), &dismissed, now),
    });
    if let Some(response) = state.value() {
        announce_urgent(&app, &response.announcements);
    }
    state
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
        }
    }

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

        let on_linux = for_this_device(all.clone(), Some(AnnouncementPlatform::Linux), &[], now());
        assert_eq!(ids(&on_linux), ["mac-and-linux", "everyone"]);
        let on_windows = for_this_device(all, Some(AnnouncementPlatform::Windows), &[], now());
        assert_eq!(ids(&on_windows), ["windows", "everyone"]);
    }

    #[test]
    fn a_closed_notice_stays_closed_but_an_urgent_one_cannot_be_closed() {
        let all = vec![
            notice("info", AnnouncementLevel::Info),
            notice("urgent", AnnouncementLevel::Urgent),
        ];
        let closed = vec!["info".to_owned(), "urgent".to_owned()];
        let shown = for_this_device(all, None, &closed, now());
        assert_eq!(ids(&shown), ["urgent"]);
    }

    #[test]
    fn a_cached_notice_past_its_expiry_is_not_shown_offline() {
        let mut expired = notice("expired", AnnouncementLevel::Info);
        expired.expires_at = Some(now() - chrono::Duration::minutes(1));
        let mut early = notice("not-yet", AnnouncementLevel::Info);
        early.starts_at = Some(now() + chrono::Duration::minutes(1));
        let live = notice("live", AnnouncementLevel::Info);
        let shown = for_this_device(vec![expired, early, live], None, &[], now());
        assert_eq!(ids(&shown), ["live"]);
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
