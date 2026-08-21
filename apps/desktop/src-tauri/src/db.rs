//! Local SQLite storage for user-owned Sajilo data.
//!
//! The web layer never opens the database directly. Commands own all reads and
//! writes so settings, plans, notifications, and future personal features use
//! one transaction boundary and one schema.

use std::fs;
use std::path::PathBuf;

use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value;
use tauri::{AppHandle, Manager, Wry};

const DATABASE_FILE: &str = "sajilo.db";
const SCHEMA_VERSION: i64 = 3;

pub type Result<T> = std::result::Result<T, String>;

fn database_path(app: &AppHandle<Wry>) -> Result<PathBuf> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join(DATABASE_FILE))
}

pub fn open(app: &AppHandle<Wry>) -> Result<Connection> {
    let connection = Connection::open(database_path(app)?).map_err(|error| error.to_string())?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| error.to_string())?;
    migrate(&connection)?;
    Ok(connection)
}

fn migrate(connection: &Connection) -> Result<()> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_meta (
                key TEXT PRIMARY KEY NOT NULL,
                value INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS day_plans (
                id TEXT PRIMARY KEY NOT NULL,
                year INTEGER NOT NULL,
                month INTEGER NOT NULL,
                day INTEGER NOT NULL,
                title TEXT NOT NULL,
                time_hour INTEGER,
                time_minute INTEGER,
                reminder INTEGER,
                note TEXT NOT NULL,
                recurrence TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS day_plans_date_idx
                ON day_plans (year, month, day);
            CREATE TABLE IF NOT EXISTS samjhana_people (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                relationship TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS samjhana_items (
                id TEXT PRIMARY KEY NOT NULL,
                person_id TEXT REFERENCES samjhana_people(id) ON DELETE SET NULL,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                status TEXT NOT NULL,
                due_calendar TEXT NOT NULL,
                due_ad TEXT NOT NULL,
                due_bs_year INTEGER NOT NULL,
                due_bs_month INTEGER NOT NULL,
                due_bs_day INTEGER NOT NULL,
                recurrence TEXT NOT NULL,
                remind_days TEXT NOT NULL,
                note TEXT NOT NULL,
                official_url TEXT NOT NULL,
                office_location TEXT NOT NULL,
                fee TEXT NOT NULL,
                application_status TEXT NOT NULL,
                checklist TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                completed_at TEXT
            );
            CREATE INDEX IF NOT EXISTS samjhana_items_due_idx
                ON samjhana_items (due_ad, status);
            CREATE INDEX IF NOT EXISTS samjhana_items_person_idx
                ON samjhana_items (person_id);
            CREATE TABLE IF NOT EXISTS samjhana_records (
                id TEXT PRIMARY KEY NOT NULL,
                document_type TEXT NOT NULL,
                number TEXT NOT NULL,
                issued_calendar TEXT,
                issued_ad TEXT,
                issued_bs_year INTEGER,
                issued_bs_month INTEGER,
                issued_bs_day INTEGER,
                expiry_calendar TEXT,
                expiry_ad TEXT,
                expiry_bs_year INTEGER,
                expiry_bs_month INTEGER,
                expiry_bs_day INTEGER,
                office TEXT NOT NULL,
                note TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            INSERT INTO schema_meta (key, value)
                VALUES ('schema_version', 1)
                ON CONFLICT(key) DO NOTHING;",
        )
        .map_err(|error| error.to_string())?;

    let version: i64 = connection
        .query_row(
            "SELECT value FROM schema_meta WHERE key = 'schema_version'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if version > SCHEMA_VERSION {
        return Err(format!(
            "Sajilo data was created by a newer database version ({version})."
        ));
    }
    if version < SCHEMA_VERSION {
        bump_schema_version(connection, SCHEMA_VERSION)?;
    }
    Ok(())
}

/// Every table so far is created with `IF NOT EXISTS`, so a schema bump has
/// nothing to migrate beyond recording the new version number.
fn bump_schema_version(connection: &Connection, version: i64) -> Result<()> {
    connection
        .execute(
            "UPDATE schema_meta SET value = ?1 WHERE key = 'schema_version'",
            params![version],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn get_json(app: &AppHandle<Wry>, key: &str) -> Result<Option<Value>> {
    let connection = open(app)?;
    let raw: Option<String> = connection
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|error| error.to_string())?;
    raw.map(|value| serde_json::from_str(&value).map_err(|error| error.to_string()))
        .transpose()
}

pub fn set_json(app: &AppHandle<Wry>, key: &str, value: &Value) -> Result<()> {
    let connection = open(app)?;
    let encoded = serde_json::to_string(value).map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, encoded],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn delete_json(app: &AppHandle<Wry>, key: &str) -> Result<()> {
    let connection = open(app)?;
    connection
        .execute("DELETE FROM settings WHERE key = ?1", [key])
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn database_file(app: &AppHandle<Wry>) -> Result<PathBuf> {
    database_path(app)
}
