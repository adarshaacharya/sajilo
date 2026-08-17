//! Export and import of the user's own data.
//!
//! The encoding rules live in `sajilo-core`; this reads and writes the store
//! around them. Format version 1 is a compatibility contract with the Swift app,
//! so a backup exported there imports here — which is what makes the migration
//! something a user can carry across rather than start over from.

use sajilo_core::backup::{Preferences, SajiloBackup};
use sajilo_core::planner::DayPlan;
use tauri::{AppHandle, Wry};
use tauri_plugin_store::StoreExt;

use crate::prefs::{PLANS_KEY, STORE_FILE};

type Result<T> = std::result::Result<T, String>;

/// Serialises the whole of the user's data to a JSON string, which the frontend
/// then hands to a save dialog.
#[tauri::command]
pub fn export_backup(app: AppHandle<Wry>) -> Result<String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let preferences: Preferences = store
        .get("preferences")
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default();
    let day_plans: Vec<DayPlan> = store
        .get(PLANS_KEY)
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default();

    SajiloBackup::new(preferences, day_plans, chrono::Utc::now())
        .encode()
        .map_err(|error| error.to_string())
}

/// What an import actually changed, so the UI can confirm rather than just
/// claiming success.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub day_plans: usize,
    pub exported_at: String,
}

/// Replaces preferences and plans with the backup's.
///
/// Deliberately a replace, not a merge: a user restoring a backup expects the
/// state they saved, and silently merging two sets of plans would leave them
/// with duplicates they never made.
#[tauri::command]
pub fn import_backup(app: AppHandle<Wry>, contents: String) -> Result<ImportSummary> {
    let backup = SajiloBackup::decode(&contents).map_err(|error| error.to_string())?;
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    store.set(
        "preferences",
        serde_json::to_value(&backup.preferences).map_err(|e| e.to_string())?,
    );
    store.set(
        PLANS_KEY,
        serde_json::to_value(&backup.day_plans).map_err(|e| e.to_string())?,
    );
    // The tray reads these keys directly, so they are mirrored to the flat names
    // it looks for rather than left only inside `preferences`.
    store.set(
        crate::prefs::MENU_BAR_FORMAT,
        serde_json::Value::String(backup.preferences.menu_bar_format.clone()),
    );
    store.set(
        crate::prefs::NUMERAL_STYLE,
        serde_json::Value::String(backup.preferences.numeral_style.clone()),
    );
    store.set(
        "language",
        serde_json::Value::String(backup.preferences.app_language.clone()),
    );
    store.save().map_err(|e| e.to_string())?;

    // The label must reflect the imported preferences immediately, or the tray
    // keeps showing the old format until the next midnight.
    crate::tray::refresh_title(&app);

    Ok(ImportSummary {
        day_plans: backup.day_plans.len(),
        exported_at: backup.exported_at.to_rfc3339(),
    })
}

/// Whether this looks like a first run, which is what gates the "import from a
/// Sajilo backup" offer. Asking every launch would be nagging.
#[tauri::command]
pub fn is_first_run(app: AppHandle<Wry>) -> bool {
    let Ok(store) = app.store(STORE_FILE) else {
        return true;
    };
    store.get("hasLaunched").is_none()
}

#[tauri::command]
pub fn mark_launched(app: AppHandle<Wry>) -> Result<()> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set("hasLaunched", serde_json::Value::Bool(true));
    store.save().map_err(|e| e.to_string())
}
