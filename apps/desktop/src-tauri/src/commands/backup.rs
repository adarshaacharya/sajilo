//! Safe SQLite database export/import.
//!
//! The database is the live source of truth. Backups are SQLite snapshots, so
//! restoring one keeps the same schema and all local data without a second
//! JSON runtime format.

use std::fs;
use std::path::Path;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Wry};

use crate::db;

type Result<T> = std::result::Result<T, String>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub database: bool,
}

fn validate_database(path: &Path) -> Result<()> {
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let check: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if check != "ok" {
        return Err(format!("Backup integrity check failed: {check}"));
    }
    let version: Option<i64> = connection
        .query_row(
            "SELECT value FROM schema_meta WHERE key = 'schema_version'",
            [],
            |row| row.get(0),
        )
        .ok();
    if !matches!(version, Some(1 | 2)) {
        return Err("This file is not a compatible Sajilo database backup.".to_owned());
    }
    Ok(())
}

#[tauri::command]
pub fn export_backup(app: AppHandle<Wry>, destination: String) -> Result<()> {
    let destination_path = Path::new(&destination);
    let source_path = db::database_file(&app)?;
    if source_path == destination_path {
        return Err("Choose a different location for the backup.".to_owned());
    }
    if destination_path.exists() {
        fs::remove_file(destination_path).map_err(|error| error.to_string())?;
    }
    let connection = db::open(&app)?;
    connection
        .execute("VACUUM INTO ?1", [&destination])
        .map_err(|error| error.to_string())?;
    // The snapshot is the whole database, which would otherwise carry this
    // machine's usage id into a file people mail around and post in issues. It
    // identifies nothing on its own, but a backup is not the place for it, and
    // an import mints a fresh one anyway.
    let exported = Connection::open(destination_path).map_err(|error| error.to_string())?;
    exported
        .execute(
            "DELETE FROM settings WHERE key = ?1",
            [crate::prefs::USAGE_INSIGHTS_INSTALL_ID],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn import_backup(app: AppHandle<Wry>, source: String) -> Result<ImportSummary> {
    let source_path = Path::new(&source);
    validate_database(source_path)?;
    let destination = db::database_file(&app)?;
    let temporary = destination.with_extension("db.importing");
    if temporary.exists() {
        fs::remove_file(&temporary).map_err(|error| error.to_string())?;
    }
    fs::copy(source_path, &temporary).map_err(|error| error.to_string())?;
    fs::rename(&temporary, &destination).map_err(|error| error.to_string())?;
    db::open(&app)?;
    // A backup is a whole-database snapshot, so it carries the usage id of the
    // machine it was taken on. Restoring one onto a second machine would make
    // two installs report as one. Dropped here; the next daily count mints a
    // fresh id, and a restore onto the same machine simply gets a new one.
    let _ = db::delete_json(&app, crate::prefs::USAGE_INSIGHTS_INSTALL_ID);
    crate::tray::refresh_title(&app);
    Ok(ImportSummary { database: true })
}

#[tauri::command]
pub fn is_first_run(app: AppHandle<Wry>) -> bool {
    db::get_json(&app, "hasLaunched").ok().flatten().is_none()
}

#[tauri::command]
pub fn mark_launched(app: AppHandle<Wry>) -> Result<()> {
    db::set_json(&app, "hasLaunched", &serde_json::Value::Bool(true))
}
