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
    Announcement, AnnouncementCategory, AnnouncementDelivery, AnnouncementLevel,
    AnnouncementPlatform, AnnouncementResponse, AnnouncementsPack,
};
use sajilo_api::load_state::LoadState;
use sajilo_core::config::Pack;
use sajilo_core::focus::ReminderStyle;
use sajilo_core::notify::{NotificationOptions, PlannedNotification, ReminderKind};
use tauri::{AppHandle, Wry};
use tauri_plugin_notification::NotificationExt;

use crate::db;
use crate::prefs::{DISMISSED_ANNOUNCEMENTS_KEY, NOTIFIED_ANNOUNCEMENTS_KEY};

/// The Nepal day an announcement last popped up, so it is one a day at most.
const LAST_POPUP_DAY_KEY: &str = "announcementPopupDay";

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

/// The one announcement to pop up now, if any: the most pressing that asks
/// for a pop-up and has not had one. At most one a day from Sajilo, however
/// many are live, and none while reminders are paused.
fn popup_due<'a>(
    shown: &'a [Announcement],
    notified: &[String],
    last_popup_day: Option<&str>,
    today: &str,
    paused: bool,
) -> Option<&'a Announcement> {
    if paused || last_popup_day == Some(today) {
        return None;
    }
    shown.iter().find(|notice| {
        notice.effective_delivery() == AnnouncementDelivery::Popup && !notified.contains(&notice.id)
    })
}

/// Pops up today's announcement, once, the way the user takes reminders: a
/// card, or a system notification.
fn pop_up(app: &AppHandle<Wry>, shown: &[Announcement], options: &NotificationOptions) {
    let notified = remembered(app, NOTIFIED_ANNOUNCEMENTS_KEY);
    let today = sajilo_core::nepal_time::today().to_string();
    let last_day = db::get_json(app, LAST_POPUP_DAY_KEY)
        .ok()
        .flatten()
        .and_then(|value| value.as_str().map(str::to_owned));
    let Some(notice) = popup_due(
        shown,
        &notified,
        last_day.as_deref(),
        &today,
        options.is_paused(Utc::now()),
    ) else {
        return;
    };
    let nepali = crate::prefs::language(app) == sajilo_core::focus::Language::Ne;
    let pick = |text: &sajilo_api::announcement::LocalizedText| {
        if nepali {
            text.ne.clone()
        } else {
            text.en.clone()
        }
    };
    let delivered = match options.style {
        ReminderStyle::Card => {
            crate::commands::reminder_card::enqueue(
                app,
                vec![PlannedNotification {
                    // The card reads the category from the id, for its
                    // "Turn off …" choice.
                    id: format!(
                        "announcement:{}:{}",
                        category_key(notice.category),
                        notice.id
                    ),
                    kind: ReminderKind::Announcement,
                    title: pick(&notice.title),
                    body: pick(&notice.body),
                    fire_at: Utc::now(),
                }],
            );
            true
        }
        ReminderStyle::Notification => app
            .notification()
            .builder()
            .title(pick(&notice.title))
            .body(pick(&notice.body))
            .show()
            .inspect_err(|error| eprintln!("sajilo: could not deliver an announcement: {error}"))
            .is_ok(),
    };
    if delivered {
        remember(app, NOTIFIED_ANNOUNCEMENTS_KEY, &notice.id);
        let _ = db::set_json(app, LAST_POPUP_DAY_KEY, &serde_json::Value::from(today));
    }
}

/// The category as the card and the settings name it.
const fn category_key(category: AnnouncementCategory) -> &'static str {
    match category {
        AnnouncementCategory::Notice => "notice",
        AnnouncementCategory::Greeting => "greeting",
        AnnouncementCategory::Update => "update",
        AnnouncementCategory::Status => "status",
        AnnouncementCategory::Tip => "tip",
        AnnouncementCategory::Ask => "ask",
        AnnouncementCategory::General => "general",
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
    let options = crate::commands::notify::options(&app);
    // A category the user switched off is gone everywhere, banner and pop-up.
    let notices = AnnouncementsPack::active()
        .notices
        .iter()
        .filter(|notice| notice.allowed_by(&options))
        .cloned()
        .collect();
    let response = AnnouncementResponse {
        announcements: for_this_device(
            notices,
            this_platform(),
            this_version(&app),
            &dismissed,
            now,
        ),
    };
    pop_up(&app, &response.announcements, &options);
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
            category: AnnouncementCategory::General,
            delivery: None,
            screen: None,
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

    #[test]
    fn one_pop_up_a_day_the_most_pressing_first_never_twice() {
        let mut quiet = notice("tip", AnnouncementLevel::Info);
        quiet.category = AnnouncementCategory::Tip;
        let mut holiday = notice("holiday", AnnouncementLevel::Important);
        holiday.category = AnnouncementCategory::Notice;
        let mut greeting = notice("dashain", AnnouncementLevel::Info);
        greeting.category = AnnouncementCategory::Greeting;
        let shown = [quiet, holiday, greeting];

        let first = popup_due(&shown, &[], None, "2026-10-07", false).unwrap();
        assert_eq!(
            first.id, "holiday",
            "a tip never pops up; the notice comes first"
        );
        assert!(popup_due(&shown, &[], Some("2026-10-07"), "2026-10-07", false).is_none());
        let next = popup_due(
            &shown,
            &["holiday".to_owned()],
            Some("2026-10-06"),
            "2026-10-07",
            false,
        );
        assert_eq!(next.unwrap().id, "dashain");
        assert!(
            popup_due(&shown, &[], None, "2026-10-07", true).is_none(),
            "paused"
        );
    }

    #[test]
    fn delivery_follows_the_category_unless_published_or_urgent() {
        let mut tip = notice("tip", AnnouncementLevel::Info);
        tip.category = AnnouncementCategory::Tip;
        assert_eq!(tip.effective_delivery(), AnnouncementDelivery::Quiet);
        tip.delivery = Some(AnnouncementDelivery::Popup);
        assert_eq!(tip.effective_delivery(), AnnouncementDelivery::Popup);
        let mut update = notice("update", AnnouncementLevel::Urgent);
        update.category = AnnouncementCategory::Update;
        update.delivery = Some(AnnouncementDelivery::Quiet);
        assert_eq!(
            update.effective_delivery(),
            AnnouncementDelivery::Popup,
            "urgent always pops up"
        );

        let options = NotificationOptions::default();
        assert!(!tip.allowed_by(&options), "tips are opt-in");
        assert!(update.allowed_by(&options));
    }
}
