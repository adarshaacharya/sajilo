//! Internet subscriptions: a few WorldLink usernames, each with a name,
//! entered once and kept on this computer, checked against WorldLink's own
//! renewal lookup one after another.
//!
//! Days left are worked out when served from the expiry date the check
//! found, so a value cached this morning is still right tonight.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};
use sajilo_api::internet::{InternetAccount, InternetStatus, WorldLinkAccount};
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
const MAX_LABEL: usize = 24;
/// A household's worth: home, shop, parents.
const MAX_ACCOUNTS: usize = 10;

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

fn feed_key(username: &str) -> String {
    format!("internet.worldlink.{}.v1", username.to_lowercase())
}

impl InternetCache {
    fn feed(&self, username: &str) -> Arc<Feed<InternetStatus>> {
        let key = feed_key(username);
        self.feeds
            .lock()
            .expect("internet feeds mutex poisoned")
            .entry(key.clone())
            .or_insert_with(|| Arc::new(Feed::keyed(key.into(), MAX_AGE_SECS, REFETCH_AFTER_SECS)))
            .clone()
    }
}

#[tauri::command]
pub fn get_worldlink_accounts(app: AppHandle<Wry>) -> Vec<WorldLinkAccount> {
    accounts(&app)
}

/// Adds a username after checking it with WorldLink, so a typo is caught
/// here rather than becoming a failed check every day after.
#[tauri::command]
pub async fn add_worldlink_account(
    app: AppHandle<Wry>,
    account: WorldLinkAccount,
) -> Result<InternetStatus, String> {
    let account = clean(account);
    if account.username.is_empty() {
        return Err("Enter your WorldLink username.".into());
    }
    let mut saved = accounts(&app);
    if saved
        .iter()
        .any(|known| known.username.eq_ignore_ascii_case(&account.username))
    {
        return Err("That username is already in the list.".into());
    }
    if saved.len() >= MAX_ACCOUNTS {
        return Err(format!("Up to {MAX_ACCOUNTS} WorldLink accounts."));
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
    saved.push(account.clone());
    save_accounts(&app, &saved)?;
    Ok(serve(&app, status))
}

/// Renames one account. The username stays; it is what WorldLink knows.
#[tauri::command]
pub fn rename_worldlink_account(
    app: AppHandle<Wry>,
    username: String,
    label: String,
) -> Result<Vec<WorldLinkAccount>, String> {
    let mut saved = accounts(&app);
    let account = saved
        .iter_mut()
        .find(|known| known.username == username)
        .ok_or("That account isn't saved.")?;
    account.label = clean(WorldLinkAccount {
        username: String::new(),
        label,
    })
    .label;
    save_accounts(&app, &saved)?;
    Ok(saved)
}

#[tauri::command]
pub fn remove_worldlink_account(
    app: AppHandle<Wry>,
    username: String,
) -> Result<Vec<WorldLinkAccount>, String> {
    let mut saved = accounts(&app);
    saved.retain(|known| known.username != username);
    save_accounts(&app, &saved)?;
    let _ = db::delete_json(&app, &feed_key(&username));
    app.state::<InternetCache>()
        .feeds
        .lock()
        .expect("internet feeds mutex poisoned")
        .remove(&feed_key(&username));
    Ok(saved)
}

/// Every saved account's subscription, each checked on its own. Empty when
/// none is saved.
#[tauri::command]
pub async fn get_internet(app: AppHandle<Wry>, refresh: Option<bool>) -> Vec<InternetAccount> {
    let cache = app.state::<InternetCache>();
    let client = &cache.client;
    let mut result = Vec::new();
    for account in accounts(&app) {
        let feed = cache.feed(&account.username);
        let state = feed
            .get(&app, Utc::now(), refresh.unwrap_or(false), || {
                let account = &account;
                async move {
                    sajilo_providers::worldlink::fetch(
                        client,
                        account,
                        sajilo_core::nepal_time::today(),
                    )
                    .await
                }
            })
            .await
            .map(|status| serve(&app, status));
        result.push(InternetAccount {
            username: account.username.clone(),
            name: account.name(),
            state,
        });
    }
    result
}

/// Renewal reminders from the cache. Planning never fetches. With several
/// accounts each says which; the first keeps the id it always had.
pub fn pending_notifications(app: &AppHandle<Wry>, now: DateTime<Utc>) -> Vec<PlannedNotification> {
    let Some(cache) = app.try_state::<InternetCache>() else {
        return Vec::new();
    };
    let saved = accounts(app);
    let named = saved.len() > 1;
    saved
        .iter()
        .enumerate()
        .filter_map(|(index, account)| {
            let (status, _) = cache.feed(&account.username).peek(app)?;
            let key = if index == 0 {
                "WorldLink".to_owned()
            } else {
                format!("WorldLink.{}", account.username.to_lowercase())
            };
            let provider = if named {
                format!("WorldLink ({})", account.name())
            } else {
                "WorldLink".to_owned()
            };
            Some(sajilo_core::internet::plan(
                &key,
                &provider,
                &status.package,
                status.expires_on,
                status.renewal_rate,
                now,
            ))
        })
        .flatten()
        .collect()
}

fn clean(account: WorldLinkAccount) -> WorldLinkAccount {
    WorldLinkAccount {
        username: account.username.trim().chars().take(MAX_USERNAME).collect(),
        label: account
            .label
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(MAX_LABEL)
            .collect(),
    }
}

/// The saved accounts. One saved before there could be several is read as
/// the first.
fn accounts(app: &AppHandle<Wry>) -> Vec<WorldLinkAccount> {
    if let Some(list) = db::get_json(app, prefs::WORLDLINK_ACCOUNTS)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
    {
        return list;
    }
    db::get_json(app, prefs::WORLDLINK_ACCOUNT)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value::<WorldLinkAccount>(value).ok())
        .into_iter()
        .collect()
}

fn save_accounts(app: &AppHandle<Wry>, accounts: &[WorldLinkAccount]) -> Result<(), String> {
    let value = serde_json::to_value(accounts).map_err(|e| e.to_string())?;
    db::set_json(app, prefs::WORLDLINK_ACCOUNTS, &value)?;
    let _ = db::delete_json(app, prefs::WORLDLINK_ACCOUNT);
    crate::commands::notify::reschedule();
    Ok(())
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
