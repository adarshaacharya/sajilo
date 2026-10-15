//! The electricity bill: one NEA account, entered once and kept on this
//! computer, checked against the authority's public bill check.
//!
//! The account's three numbers go to NEA and nowhere else. What is due today
//! (stage, days left, the rebate) is worked out when served, never cached.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};
use sajilo_api::electricity::{BillDue, DueStage, ElectricityStatement, NeaAccount, NeaOffice};
use sajilo_api::load_state::LoadState;
use sajilo_core::electricity::{self, REBATE_PERCENT, Stage, UnpaidBill};
use sajilo_core::notify::PlannedNotification;
use sajilo_providers::HttpClient;
use tauri::{AppHandle, Manager, Wry};

use crate::feed::Feed;
use crate::{db, prefs};

type Result<T> = std::result::Result<T, String>;

/// Bills come once a month; a day-old check is still current.
const MAX_AGE_SECS: i64 = 24 * 60 * 60;
const REFETCH_AFTER_SECS: i64 = 6 * 60 * 60;
/// The office list changes when NEA opens or merges an office.
const OFFICES_MAX_AGE_SECS: i64 = 30 * 24 * 60 * 60;
/// Longer than any SC number or consumer id on a bill.
const MAX_FIELD: usize = 40;

pub struct ElectricityCache {
    offices: Feed<Vec<NeaOffice>>,
    /// One per account, so changing the account never shows the old one's
    /// bills, even labelled stale.
    statements: Mutex<HashMap<String, Arc<Feed<ElectricityStatement>>>>,
    client: HttpClient,
}

impl Default for ElectricityCache {
    fn default() -> Self {
        Self {
            offices: Feed::new(
                prefs::NEA_OFFICES_KEY,
                OFFICES_MAX_AGE_SECS,
                OFFICES_MAX_AGE_SECS,
            ),
            statements: Mutex::new(HashMap::new()),
            client: HttpClient::new(),
        }
    }
}

impl ElectricityCache {
    fn statement(&self, account: &NeaAccount) -> Arc<Feed<ElectricityStatement>> {
        let key = format!("electricity.{}.v1", account.consumer_id);
        self.statements
            .lock()
            .expect("electricity feeds mutex poisoned")
            .entry(key.clone())
            .or_insert_with(|| Arc::new(Feed::keyed(key.into(), MAX_AGE_SECS, REFETCH_AFTER_SECS)))
            .clone()
    }
}

/// The offices to pick from.
#[tauri::command]
pub async fn nea_offices(app: AppHandle<Wry>) -> LoadState<Vec<NeaOffice>> {
    let cache = app.state::<ElectricityCache>();
    let client = &cache.client;
    cache
        .offices
        .get(&app, Utc::now(), false, || async move {
            sajilo_providers::nea::fetch_offices(client).await
        })
        .await
}

/// The saved account, if one is.
#[tauri::command]
pub fn get_nea_account(app: AppHandle<Wry>) -> Option<NeaAccount> {
    account(&app)
}

/// Saves the account after checking it with NEA, so a mistyped number is
/// caught here rather than turning into a failed check every day after.
#[tauri::command]
pub async fn set_nea_account(
    app: AppHandle<Wry>,
    account: NeaAccount,
) -> std::result::Result<ElectricityStatement, String> {
    let account = NeaAccount {
        office_code: clip(&account.office_code),
        sc_no: clip(&account.sc_no),
        consumer_id: clip(&account.consumer_id),
    };
    if account.office_code.is_empty() || account.sc_no.is_empty() {
        return Err("Choose the office and enter the SC number.".into());
    }
    if account.consumer_id.is_empty() || !account.consumer_id.chars().all(|c| c.is_ascii_digit()) {
        return Err("The consumer ID is digits only.".into());
    }
    let cache = app.state::<ElectricityCache>();
    let statement = sajilo_providers::nea::fetch_statement(
        &cache.client,
        &account,
        sajilo_core::nepal_time::today(),
    )
    .await
    .map_err(|error| {
        if error
            .to_string()
            .contains(sajilo_providers::nea::NO_RECORDS)
        {
            "NEA has no bills for these numbers. Check them against your bill.".to_owned()
        } else {
            "Couldn't reach NEA. Try again in a moment.".to_owned()
        }
    })?;
    let value = serde_json::to_value(&account).map_err(|e| e.to_string())?;
    db::set_json(&app, prefs::NEA_ACCOUNT, &value)?;
    crate::commands::notify::reschedule();
    Ok(serve(&app, statement))
}

/// Forgets the account and its bills.
#[tauri::command]
pub fn clear_nea_account(app: AppHandle<Wry>) -> Result<()> {
    db::delete_json(&app, prefs::NEA_ACCOUNT)?;
    crate::commands::notify::reschedule();
    Ok(())
}

/// The saved account's bills. Unavailable when none is saved.
#[tauri::command]
pub async fn get_electricity(
    app: AppHandle<Wry>,
    refresh: Option<bool>,
) -> LoadState<ElectricityStatement> {
    let Some(account) = account(&app) else {
        return LoadState::Unavailable;
    };
    let cache = app.state::<ElectricityCache>();
    let feed = cache.statement(&account);
    let client = &cache.client;
    let account = &account;
    feed.get(&app, Utc::now(), refresh.unwrap_or(false), || async move {
        sajilo_providers::nea::fetch_statement(client, account, sajilo_core::nepal_time::today())
            .await
    })
    .await
    .map(|statement| serve(&app, statement))
}

/// Reminders for unpaid bills, from the cache. Planning never fetches.
pub fn pending_notifications(app: &AppHandle<Wry>, now: DateTime<Utc>) -> Vec<PlannedNotification> {
    let Some(account) = account(app) else {
        return Vec::new();
    };
    let Some(cache) = app.try_state::<ElectricityCache>() else {
        return Vec::new();
    };
    let Some((statement, _)) = cache.statement(&account).peek(app) else {
        return Vec::new();
    };
    let unpaid: Vec<UnpaidBill> = statement
        .bills
        .iter()
        .filter(|bill| !bill.paid && !bill.is_arrears)
        .map(|bill| UnpaidBill {
            month: bill.month.clone(),
            bill_date: bill.bill_date,
            amount: bill.amount,
        })
        .collect();
    electricity::plan(&unpaid, now)
}

fn account(app: &AppHandle<Wry>) -> Option<NeaAccount> {
    db::get_json(app, prefs::NEA_ACCOUNT)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
}

fn clip(text: &str) -> String {
    text.trim().chars().take(MAX_FIELD).collect()
}

/// Fills in what is due today: the oldest unpaid month decides the stage,
/// and arrears are added to the total.
fn serve(app: &AppHandle<Wry>, mut statement: ElectricityStatement) -> ElectricityStatement {
    let today = sajilo_core::nepal_time::today();
    let nepali = prefs::language(app) == sajilo_core::focus::Language::Ne;
    let today_bs = sajilo_core::calendar::bikram_sambat::nepali_date_from(today).ok();
    let label = |date: chrono::NaiveDate| {
        today_bs.and_then(|bs| sajilo_api::labels::bs_label_of(date, bs, nepali))
    };
    for bill in &mut statement.bills {
        bill.bill_date_label = label(bill.bill_date);
        bill.paid_on_label = bill.paid_on.and_then(label);
    }
    let unpaid: Vec<_> = statement.bills.iter().filter(|bill| !bill.paid).collect();
    let oldest = unpaid
        .iter()
        .filter(|bill| !bill.is_arrears)
        .min_by_key(|bill| bill.bill_date);
    statement.due = oldest.map(|bill| {
        let total: f64 = unpaid.iter().map(|bill| bill.amount).sum();
        let (stage, until) = match electricity::stage(bill.bill_date, today) {
            Stage::Rebate { until } => (DueStage::Rebate, Some(until)),
            Stage::Normal { until } => (DueStage::Normal, Some(until)),
            Stage::Penalty { cut_after } => (DueStage::Penalty, Some(cut_after)),
            Stage::Disconnection => (DueStage::Disconnection, None),
        };
        // The rebate is on the month's bill, not on arrears.
        let months: f64 = unpaid
            .iter()
            .filter(|bill| !bill.is_arrears)
            .map(|bill| bill.amount)
            .sum();
        BillDue {
            month: bill.month.clone(),
            total,
            stage,
            until,
            days_left: until.and_then(|until| i32::try_from((until - today).num_days()).ok()),
            with_rebate: (stage == DueStage::Rebate)
                .then(|| total - months * REBATE_PERCENT / 100.0),
            until_label: until.and_then(label),
        }
    });
    statement
}
