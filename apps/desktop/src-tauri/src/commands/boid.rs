//! IPO allotments and unclaimed dividends for a few BOIDs, a family's,
//! asked of the share registrars. Each BOID is entered once with a name and
//! kept on this computer; it goes only to the registrars' own lookups.
//!
//! Each issue is asked about once: the answers live in a ledger per BOID, so
//! after a BOID's first scan (about half a minute) a check asks only about newly
//! listed issues. Allotments found after that first scan are news: they get
//! a reminder card and a "New" mark for a while.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};
use sajilo_api::boid::{BoidAccount, BoidReport};
use sajilo_api::load_state::LoadState;
use sajilo_core::notify::{PlannedNotification, ReminderKind, still_deliverable};
use sajilo_providers::HttpClient;
use sajilo_providers::boid::{AccountState, BoidScan, Ledger};
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::{db, prefs};

/// Allotment results come a few times a month; twice a day is plenty.
const MAX_AGE_SECS: i64 = 24 * 60 * 60;
const REFETCH_AFTER_SECS: i64 = 12 * 60 * 60;
/// A family's worth. Each first scan is a hundred-odd lookups.
const MAX_ACCOUNTS: usize = 10;
const MAX_LABEL_CHARS: usize = 24;

pub struct BoidCache {
    feeds: Mutex<HashMap<String, Arc<Feed<BoidScan>>>>,
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

fn feed_key(boid: &str) -> String {
    format!("boid.{boid}.v2")
}

impl BoidCache {
    fn feed(&self, boid: &str) -> Arc<Feed<BoidScan>> {
        let key = feed_key(boid);
        self.feeds
            .lock()
            .expect("boid feeds mutex poisoned")
            .entry(key.clone())
            .or_insert_with(|| Arc::new(Feed::keyed(key.into(), MAX_AGE_SECS, REFETCH_AFTER_SECS)))
            .clone()
    }

    fn forget(&self, boid: &str) {
        self.feeds
            .lock()
            .expect("boid feeds mutex poisoned")
            .remove(&feed_key(boid));
    }
}

#[tauri::command]
pub fn get_boid_accounts(app: AppHandle<Wry>) -> Vec<BoidAccount> {
    accounts(&app)
}

/// Saves the whole list: added, renamed, reordered or removed. A removed
/// BOID's answers are deleted with it. New ones are not scanned here: the
/// first scan is long, so the screen asks for the report next.
#[tauri::command]
pub fn set_boid_accounts(
    app: AppHandle<Wry>,
    accounts: Vec<BoidAccount>,
) -> Result<Vec<BoidAccount>, String> {
    if accounts.len() > MAX_ACCOUNTS {
        return Err(format!("Up to {MAX_ACCOUNTS} BOIDs."));
    }
    let mut clean: Vec<BoidAccount> = Vec::with_capacity(accounts.len());
    for account in accounts {
        let boid = sajilo_providers::boid::valid_boid(&account.boid)
            .ok_or("A BOID is 16 digits starting with 130, as MeroShare shows it.")?;
        if clean.iter().any(|known| known.boid == boid) {
            return Err("That BOID is already in the list.".to_owned());
        }
        let label = account
            .label
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(MAX_LABEL_CHARS)
            .collect();
        clean.push(BoidAccount { boid, label });
    }

    let cache = app.state::<BoidCache>();
    for gone in self::accounts(&app)
        .iter()
        .filter(|old| !clean.iter().any(|new| new.boid == old.boid))
    {
        let _ = db::delete_json(&app, &ledger_key(&gone.boid));
        let _ = db::delete_json(&app, &feed_key(&gone.boid));
        // Where the first build kept its cache.
        let _ = db::delete_json(&app, &format!("boid.{}.v1", gone.boid));
        cache.forget(&gone.boid);
    }
    let value = serde_json::to_value(&clean).map_err(|e| e.to_string())?;
    db::set_json(&app, prefs::BOID_ACCOUNTS, &value)?;
    let _ = db::delete_json(&app, prefs::BOID_ACCOUNT);
    crate::commands::notify::reschedule();
    Ok(clean)
}

/// What the registrars have for every saved BOID, by issue. Unavailable when
/// none is saved. Accounts are checked one after another, never together:
/// the registrars are small servers.
#[tauri::command]
pub async fn get_boid_report(app: AppHandle<Wry>, refresh: Option<bool>) -> LoadState<BoidReport> {
    let accounts = accounts(&app);
    if accounts.is_empty() {
        return LoadState::Unavailable;
    }
    let cache = app.state::<BoidCache>();
    let client = &cache.client;
    let mut states = Vec::with_capacity(accounts.len());
    for account in &accounts {
        let boid = account.boid.clone();
        let handle = app.clone();
        let state = cache
            .feed(&account.boid)
            .get(&app, Utc::now(), refresh.unwrap_or(false), || async move {
                let mut ledger = ledger(&handle, &boid);
                let scan =
                    sajilo_providers::boid::scan(client, &boid, &mut ledger, Utc::now()).await;
                save_ledger(&handle, &boid, &ledger);
                Ok(scan)
            })
            .await;
        states.push(state);
    }
    crate::commands::notify::reschedule();

    // Nothing at all is a failure; otherwise what is known is shown, and
    // labelled stale if any account's part is.
    if states.iter().all(|state| state.value().is_none()) {
        return match states.into_iter().next() {
            Some(LoadState::Failed(error)) => LoadState::Failed(error),
            _ => LoadState::Failed("The share registrars couldn't be reached.".to_owned()),
        };
    }
    let stale = states
        .iter()
        .any(|state| state.is_stale() || state.value().is_none());
    let ledgers: Vec<Ledger> = accounts.iter().map(|a| ledger(&app, &a.boid)).collect();
    let parts: Vec<AccountState<'_>> = accounts
        .iter()
        .zip(&ledgers)
        .zip(&states)
        .map(|((account, ledger), state)| AccountState {
            account,
            ledger,
            scan: state.value(),
        })
        .collect();
    let report = serve(&app, sajilo_providers::boid::report(&parts, Utc::now()));
    if stale {
        LoadState::Stale(report)
    } else {
        LoadState::Fresh(report)
    }
}

/// A card for each allotment found since an account's first scan, when it
/// was found. Named when there is more than one account.
pub fn pending_notifications(app: &AppHandle<Wry>, now: DateTime<Utc>) -> Vec<PlannedNotification> {
    let accounts = accounts(app);
    let named = accounts.len() > 1;
    accounts
        .iter()
        .flat_map(|account| {
            let ledger = ledger(app, &account.boid);
            ledger
                .found_at
                .iter()
                .filter(|(_, found)| still_deliverable(**found, now))
                .filter_map(|(id, found)| {
                    let allotment = ledger.checked.get(id)?.as_ref()?;
                    let title = if named {
                        format!("{}: allotted {} kitta", account.name(), allotment.allotted)
                    } else {
                        format!("Allotted {} kitta", allotment.allotted)
                    };
                    Some(PlannedNotification {
                        id: format!("sajilo.boid.{}.{id}", account.boid),
                        kind: ReminderKind::Keeper,
                        title,
                        body: format!(
                            "{} · {}",
                            sajilo_providers::boid::short_company(&allotment.company),
                            allotment.registrar.name()
                        ),
                        fire_at: *found,
                    })
                })
                .collect::<Vec<_>>()
        })
        .collect()
}

/// The saved accounts. One saved before there could be several is read as
/// the first.
fn accounts(app: &AppHandle<Wry>) -> Vec<BoidAccount> {
    if let Some(list) = db::get_json(app, prefs::BOID_ACCOUNTS)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
    {
        return list;
    }
    db::get_json(app, prefs::BOID_ACCOUNT)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value::<BoidAccount>(value).ok())
        .into_iter()
        .collect()
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

fn serve(app: &AppHandle<Wry>, mut report: BoidReport) -> BoidReport {
    let nepali = prefs::language(app) == sajilo_core::focus::Language::Ne;
    let today =
        sajilo_core::calendar::bikram_sambat::nepali_date_from(sajilo_core::nepal_time::today())
            .ok();
    for ipo in &mut report.ipos {
        ipo.published_label = match (ipo.published_on, today) {
            (Some(date), Some(today)) => sajilo_api::labels::bs_label_of(date, today, nepali),
            _ => None,
        };
    }
    report
}
