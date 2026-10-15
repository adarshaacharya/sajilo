//! The internet subscription: one WorldLink username, entered once and kept
//! on this computer, checked against WorldLink's own renewal lookup.
//!
//! Days left are worked out when served from the expiry date the check
//! found, so a value cached this morning is still right tonight.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};
use sajilo_api::internet::{InternetStatus, WorldLinkAccount};
use sajilo_api::load_state::LoadState;
use sajilo_core::notify::PlannedNotification;
use sajilo_providers::HttpClient;
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::{db, prefs};

/// Days left change once a day; a few hours old is current.
const MAX_AGE_SECS: i64 = 24 * 60 * 60;
const REFETCH_AFTER_SECS: i64 = 8 * 60 * 60;
/// Longer than any WorldLink username.
const MAX_USERNAME: usize = 60;

pub struct InternetCache {
    /// One per username, so changing it never shows the old one's plan.
    feeds: Mutex<HashMap<String, Arc<Feed<InternetStatus>>>>,
    client: HttpClient,
}

impl Default for InternetCache {
    fn default() -> Self {
        Self {
            feeds: Mutex::new(HashMap::new()),
            client: HttpClient::new(),
        }
    }
}

impl InternetCache {
    fn feed(&self, account: &WorldLinkAccount) -> Arc<Feed<InternetStatus>> {
        let key = format!("internet.worldlink.{}.v1", account.username.to_lowercase());
        self.feeds
            .lock()
            .expect("internet feeds mutex poisoned")
            .entry(key.clone())
            .or_insert_with(|| Arc::new(Feed::keyed(key.into(), MAX_AGE_SECS, REFETCH_AFTER_SECS)))
            .clone()
    }
}

#[tauri::command]
pub fn get_worldlink_account(app: AppHandle<Wry>) -> Option<WorldLinkAccount> {
    account(&app)
}

/// Saves the username after checking it with WorldLink, so a typo is caught
/// here rather than becoming a failed check every day after.
#[tauri::command]
pub async fn set_worldlink_account(
    app: AppHandle<Wry>,
    account: WorldLinkAccount,
) -> Result<InternetStatus, String> {
    let account = WorldLinkAccount {
        username: account.username.trim().chars().take(MAX_USERNAME).collect(),
    };
    if account.username.is_empty() {
        return Err("Enter your WorldLink username.".into());
    }
    let cache = app.state::<InternetCache>();
    let status = sajilo_providers::worldlink::fetch(
        &cache.client,
        &account,
        sajilo_core::nepal_time::today(),
    )
    .await
    .map_err(|error| {
        if error
            .to_string()
            .contains(sajilo_providers::worldlink::NOT_FOUND)
        {
            "WorldLink doesn't know this username. Check it on your bill or app.".to_owned()
        } else {
            "Couldn't reach WorldLink. Try again in a moment.".to_owned()
        }
    })?;
    let value = serde_json::to_value(&account).map_err(|e| e.to_string())?;
    db::set_json(&app, prefs::WORLDLINK_ACCOUNT, &value)?;
    crate::commands::notify::reschedule();
    Ok(serve(&app, status))
}

#[tauri::command]
pub fn clear_worldlink_account(app: AppHandle<Wry>) -> Result<(), String> {
    db::delete_json(&app, prefs::WORLDLINK_ACCOUNT)?;
    crate::commands::notify::reschedule();
    Ok(())
}

/// The saved account's subscription. Unavailable when none is saved.
#[tauri::command]
pub async fn get_internet(app: AppHandle<Wry>, refresh: Option<bool>) -> LoadState<InternetStatus> {
    let Some(account) = account(&app) else {
        return LoadState::Unavailable;
    };
    let cache = app.state::<InternetCache>();
    let feed = cache.feed(&account);
    let client = &cache.client;
    let account = &account;
    feed.get(&app, Utc::now(), refresh.unwrap_or(false), || async move {
        sajilo_providers::worldlink::fetch(client, account, sajilo_core::nepal_time::today()).await
    })
    .await
    .map(|status| serve(&app, status))
}

/// Renewal reminders from the cache. Planning never fetches.
pub fn pending_notifications(app: &AppHandle<Wry>, now: DateTime<Utc>) -> Vec<PlannedNotification> {
    let Some(account) = account(app) else {
        return Vec::new();
    };
    let Some(cache) = app.try_state::<InternetCache>() else {
        return Vec::new();
    };
    let Some((status, _)) = cache.feed(&account).peek(app) else {
        return Vec::new();
    };
    sajilo_core::internet::plan(
        "WorldLink",
        &status.package,
        status.expires_on,
        status.renewal_rate,
        now,
    )
}

fn account(app: &AppHandle<Wry>) -> Option<WorldLinkAccount> {
    db::get_json(app, prefs::WORLDLINK_ACCOUNT)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
}

fn serve(app: &AppHandle<Wry>, mut status: InternetStatus) -> InternetStatus {
    let today = sajilo_core::nepal_time::today();
    let nepali = prefs::language(app) == sajilo_core::focus::Language::Ne;
    status.days_left = i32::try_from((status.expires_on - today).num_days()).ok();
    status.expires_label = sajilo_core::calendar::bikram_sambat::nepali_date_from(today)
        .ok()
        .and_then(|bs| sajilo_api::labels::bs_label_of(status.expires_on, bs, nepali));
    status
}
