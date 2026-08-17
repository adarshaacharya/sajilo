//! Day-plan storage.
//!
//! The recurrence and ordering rules live in `sajilo-core`; this file only
//! persists. `tauri-plugin-store` keeps a JSON file in the app's data
//! directory, which is also what makes the M9 backup a straight copy.

use sajilo_core::NepaliDate;
use sajilo_core::planner::{DayPlan, plans_on};
use tauri::{AppHandle, Wry};
use tauri_plugin_store::StoreExt;

use crate::prefs::{PLANS_KEY, STORE_FILE};

type Result<T> = std::result::Result<T, String>;

fn load(app: &AppHandle<Wry>) -> Result<Vec<DayPlan>> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let Some(raw) = store.get(PLANS_KEY) else {
        return Ok(Vec::new());
    };
    // A store written by a newer build, or hand-edited, must not take the whole
    // screen down — an unreadable list reads as empty and is replaced on the
    // next write.
    Ok(serde_json::from_value(raw).unwrap_or_default())
}

fn save(app: &AppHandle<Wry>, plans: &[DayPlan]) -> Result<()> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(
        PLANS_KEY,
        serde_json::to_value(plans).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_plans(app: AppHandle<Wry>) -> Result<Vec<DayPlan>> {
    load(&app)
}

/// Every plan falling on one day, recurrence resolved and ordered for display.
#[tauri::command]
pub fn plans_for_day(app: AppHandle<Wry>, year: i32, month: u32, day: u32) -> Result<Vec<DayPlan>> {
    Ok(plans_on(&load(&app)?, NepaliDate::new(year, month, day)))
}

/// Adds or replaces a plan, matched on id — so the editor can save an edit
/// without the caller needing a separate update command.
#[tauri::command]
pub fn save_plan(app: AppHandle<Wry>, plan: DayPlan) -> Result<Vec<DayPlan>> {
    let plan = plan.normalised();
    let mut plans = load(&app)?;
    match plans.iter_mut().find(|existing| existing.id == plan.id) {
        Some(existing) => *existing = plan,
        None => plans.push(plan),
    }
    save(&app, &plans)?;
    Ok(plans)
}

#[tauri::command]
pub fn delete_plan(app: AppHandle<Wry>, id: String) -> Result<Vec<DayPlan>> {
    let mut plans = load(&app)?;
    plans.retain(|plan| plan.id != id);
    save(&app, &plans)?;
    Ok(plans)
}
