//! Monthly SIP payment schedules, one per fund, kept on the device.
//!
//! Every command answers with every fund's status, so a screen that changed
//! one schedule redraws the countdown from the same answer — and the frontend
//! never works out a due date or its Bikram Sambat day itself.

use sajilo_core::nepal_time;
use sajilo_core::sip::{self, SipPlan, SipStatus};
use tauri::{AppHandle, Wry};

use crate::{db, prefs::SIP_PLANS};

type Result<T> = std::result::Result<T, String>;

/// The saved schedules. One that no longer reads (from a newer build) is
/// dropped rather than failing every screen that shows a countdown.
pub fn plans(app: &AppHandle<Wry>) -> Vec<SipPlan> {
    db::get_json(app, SIP_PLANS)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle<Wry>, plans: &[SipPlan]) -> Result<Vec<SipStatus>> {
    let value = serde_json::to_value(plans).map_err(|error| error.to_string())?;
    db::set_json(app, SIP_PLANS, &value)?;
    Ok(sip::statuses(plans, nepal_time::today()))
}

fn edit(
    app: &AppHandle<Wry>,
    symbol: &str,
    change: impl FnOnce(&mut SipPlan),
) -> Result<Vec<SipStatus>> {
    let mut all = plans(app);
    if let Some(plan) = all.iter_mut().find(|plan| plan.symbol == symbol) {
        change(plan);
    }
    save(app, &all)
}

#[tauri::command]
pub fn sip_statuses(app: AppHandle<Wry>) -> Vec<SipStatus> {
    sip::statuses(&plans(&app), nepal_time::today())
}

/// Starts a schedule, or changes its day or amount. What was already marked
/// paid is kept: moving the day does not re-open a month already paid.
#[tauri::command]
pub fn set_sip(
    app: AppHandle<Wry>,
    symbol: String,
    name: String,
    day: u32,
    amount: Option<f64>,
    remind_days: Vec<u32>,
) -> Result<Vec<SipStatus>> {
    if !(1..=31).contains(&day) {
        return Err(format!("day {day} is not a day of the month"));
    }
    let amount = amount.filter(|amount| amount.is_finite() && *amount > 0.0);
    let mut remind_days: Vec<u32> = remind_days.into_iter().filter(|days| *days <= 31).collect();
    remind_days.sort_unstable_by(|a, b| b.cmp(a));
    remind_days.dedup();
    let mut all = plans(&app);
    match all.iter_mut().find(|plan| plan.symbol == symbol) {
        Some(plan) => {
            plan.name = name;
            plan.day = day;
            plan.amount = amount;
            plan.remind_days = remind_days;
        }
        None => all.push(SipPlan {
            symbol,
            name,
            day,
            amount,
            remind_days,
            paid_month: None,
            remind_on: None,
        }),
    }
    save(&app, &all)
}

#[tauri::command]
pub fn remove_sip(app: AppHandle<Wry>, symbol: String) -> Result<Vec<SipStatus>> {
    let mut all = plans(&app);
    all.retain(|plan| plan.symbol != symbol);
    save(&app, &all)
}

#[tauri::command]
pub fn mark_sip_paid(app: AppHandle<Wry>, symbol: String) -> Result<Vec<SipStatus>> {
    let today = nepal_time::today();
    edit(&app, &symbol, |plan| sip::mark_paid(plan, today))
}

/// "Remind me tomorrow": one more reminder in the morning, if still unpaid.
#[tauri::command]
pub fn remind_sip_tomorrow(app: AppHandle<Wry>, symbol: String) -> Result<Vec<SipStatus>> {
    let tomorrow = nepal_time::today() + chrono::Duration::days(1);
    edit(&app, &symbol, |plan| {
        plan.remind_on = Some(tomorrow.to_string())
    })
}
