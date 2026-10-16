//! A BOID's IPO allotments and unclaimed dividends, asked of the share
//! registrars. The BOID is entered once and kept on this computer; it goes
//! only to the registrars' own lookups.
//!
//! Each issue is asked about once: the answers live in a ledger per BOID, so
//! after the first scan (about half a minute) a check asks only about newly
//! listed issues. Allotments found after that first scan are news: they get
//! a reminder card and a "New" mark for a while.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Duration, Utc};
use sajilo_api::boid::{BoidAccount, BoidReport};
use sajilo_api::load_state::LoadState;
use sajilo_core::notify::{PlannedNotification, ReminderKind, still_deliverable};
use sajilo_providers::HttpClient;
use sajilo_providers::boid::Ledger;
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::{db, prefs};

/// Allotment results come a few times a month; twice a day is plenty.
const MAX_AGE_SECS: i64 = 24 * 60 * 60;
const REFETCH_AFTER_SECS: i64 = 12 * 60 * 60;
/// How long a newly found allotment is marked new.
const NEW_FOR_DAYS: i64 = 14;

pub struct BoidCache {
    feeds: Mutex<HashMap<String, Arc<Feed<BoidReport>>>>,
    client: HttpClient,
}

impl Default for BoidCache {
    fn default() -> Self {
        Self {
            feeds: Mutex::new(HashMap::new()),
            client: HttpClient::new(),
        }
    }
}

impl BoidCache {
    fn feed(&self, boid: &str) -> Arc<Feed<BoidReport>> {
        let key = format!("boid.{boid}.v1");
        self.feeds
            .lock()
            .expect("boid feeds mutex poisoned")
            .entry(key.clone())
            .or_insert_with(|| Arc::new(Feed::keyed(key.into(), MAX_AGE_SECS, REFETCH_AFTER_SECS)))
            .clone()
    }
}

#[tauri::command]
pub fn get_boid_account(app: AppHandle<Wry>) -> Option<BoidAccount> {
    account(&app)
}

/// Saves the BOID. The first scan is long, so it is not run here: the screen
/// asks for the report next and shows it checking.
#[tauri::command]
pub fn set_boid_account(app: AppHandle<Wry>, account: BoidAccount) -> Result<BoidAccount, String> {
    let boid = sajilo_providers::boid::valid_boid(&account.boid)
        .ok_or("A BOID is 16 digits starting with 130, as MeroShare shows it.")?;
    let account = BoidAccount { boid };
    let value = serde_json::to_value(&account).map_err(|e| e.to_string())?;
    db::set_json(&app, prefs::BOID_ACCOUNT, &value)?;
    Ok(account)
}

#[tauri::command]
pub fn clear_boid_account(app: AppHandle<Wry>) -> Result<(), String> {
    db::delete_json(&app, prefs::BOID_ACCOUNT)?;
    crate::commands::notify::reschedule();
    Ok(())
}

/// What the registrars have for the saved BOID. Unavailable when none is.
#[tauri::command]
pub async fn get_boid_report(app: AppHandle<Wry>, refresh: Option<bool>) -> LoadState<BoidReport> {
    let Some(account) = account(&app) else {
        return LoadState::Unavailable;
    };
    let cache = app.state::<BoidCache>();
    let feed = cache.feed(&account.boid);
    let client = &cache.client;
    let boid = account.boid.clone();
    let handle = app.clone();
    let state = feed
        .get(&app, Utc::now(), refresh.unwrap_or(false), || async move {
            let mut ledger = ledger(&handle, &boid);
            let report = sajilo_providers::boid::scan(client, &boid, &mut ledger, Utc::now()).await;
            save_ledger(&handle, &boid, &ledger);
            crate::commands::notify::reschedule();
            Ok(report)
        })
        .await;
    let ledger = ledger(&app, &account.boid);
    state.map(|report| serve(&app, report, &ledger))
}

/// A card for each allotment found since the first scan, when it was found.
pub fn pending_notifications(app: &AppHandle<Wry>, now: DateTime<Utc>) -> Vec<PlannedNotification> {
    let Some(account) = account(app) else {
        return Vec::new();
    };
    let ledger = ledger(app, &account.boid);
    ledger
        .found_at
        .iter()
        .filter(|(_, found)| still_deliverable(**found, now))
        .filter_map(|(id, found)| {
            let allotment = ledger.checked.values().flatten().find(|a| &a.id == id)?;
            Some(PlannedNotification {
                id: format!("sajilo.boid.{id}"),
                kind: ReminderKind::Keeper,
                title: format!("Allotted {} kitta", allotment.allotted),
                body: format!("{} · {}", allotment.company, allotment.registrar.name()),
                fire_at: *found,
            })
        })
        .collect()
}

fn account(app: &AppHandle<Wry>) -> Option<BoidAccount> {
    db::get_json(app, prefs::BOID_ACCOUNT)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
}

fn ledger_key(boid: &str) -> String {
    format!("boidLedger.{boid}")
}

fn ledger(app: &AppHandle<Wry>, boid: &str) -> Ledger {
    db::get_json(app, &ledger_key(boid))
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

fn save_ledger(app: &AppHandle<Wry>, boid: &str, ledger: &Ledger) {
    if let Ok(value) = serde_json::to_value(ledger) {
        let _ = db::set_json(app, &ledger_key(boid), &value);
    }
}

fn serve(app: &AppHandle<Wry>, mut report: BoidReport, ledger: &Ledger) -> BoidReport {
    let now = Utc::now();
    let nepali = prefs::language(app) == sajilo_core::focus::Language::Ne;
    let today =
        sajilo_core::calendar::bikram_sambat::nepali_date_from(sajilo_core::nepal_time::today())
            .ok();
    for allotment in &mut report.allotments {
        allotment.is_new = ledger
            .found_at
            .get(&allotment.id)
            .is_some_and(|found| now - *found < Duration::days(NEW_FOR_DAYS));
        allotment.published_label = match (allotment.published_on, today) {
            (Some(date), Some(today)) => sajilo_api::labels::bs_label_of(date, today, nepali),
            _ => None,
        };
    }
    report
}
