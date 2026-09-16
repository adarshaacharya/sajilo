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
const SCHEMA_VERSION: i64 = 6;

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
            CREATE TABLE IF NOT EXISTS keeper_people (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                relationship TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS keeper_items (
                id TEXT PRIMARY KEY NOT NULL,
                person_id TEXT REFERENCES keeper_people(id) ON DELETE SET NULL,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                status TEXT NOT NULL,
                due_calendar TEXT,
                due_ad TEXT,
                due_bs_year INTEGER,
                due_bs_month INTEGER,
                due_bs_day INTEGER,
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
            CREATE INDEX IF NOT EXISTS keeper_items_due_idx
                ON keeper_items (due_ad, status);
            CREATE INDEX IF NOT EXISTS keeper_items_person_idx
                ON keeper_items (person_id);
            CREATE TABLE IF NOT EXISTS keeper_records (
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
                updated_at TEXT NOT NULL,
                details TEXT NOT NULL DEFAULT '{}',
                person_id TEXT REFERENCES keeper_people(id) ON DELETE SET NULL,
                recurrence TEXT NOT NULL DEFAULT 'none',
                remind_days TEXT NOT NULL DEFAULT '[]',
                links TEXT NOT NULL DEFAULT '[]',
                custom_fields TEXT NOT NULL DEFAULT '[]'
            );
            INSERT INTO schema_meta (key, value)
                VALUES ('schema_version', 1)
                ON CONFLICT(key) DO NOTHING;",
        )
        .map_err(|error| error.to_string())?;

    let version = schema_version(connection)?;
    if version > SCHEMA_VERSION {
        return Err(format!(
            "Sajilo data was created by a newer database version ({version})."
        ));
    }
    if version < SCHEMA_VERSION {
        upgrade(connection, version)?;
    }
    Ok(())
}

fn upgrade(connection: &Connection, from: i64) -> Result<()> {
    if from < 4 {
        migrate_keeper_v4(connection)?;
    }
    if from < 5 {
        migrate_keeper_v5(connection)?;
    }
    if from < 6 {
        migrate_keeper_v6(connection)?;
    }
    bump_schema_version(connection, SCHEMA_VERSION)
}

fn schema_version(connection: &Connection) -> Result<i64> {
    connection
        .query_row(
            "SELECT value FROM schema_meta WHERE key = 'schema_version'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
}

fn table_columns(connection: &Connection, table: &str) -> Result<Vec<(String, bool)>> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(1)?, row.get::<_, i64>(3)? != 0))
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

/// v4: a Keeper reminder may have no due date (e.g. a citizenship
/// application), and records carry type-specific details (bluebook, insurance,
/// warranty). Checks the live columns rather than trusting the version alone,
/// because a fresh database is already created with the v4 shape.
fn migrate_keeper_v4(connection: &Connection) -> Result<()> {
    let due_required = table_columns(connection, "keeper_items")?
        .iter()
        .any(|(name, not_null)| name == "due_ad" && *not_null);
    if due_required {
        // SQLite cannot drop NOT NULL in place; rebuild the table.
        connection
            .execute_batch(
                "BEGIN;
                CREATE TABLE keeper_items_v4 (
                    id TEXT PRIMARY KEY NOT NULL,
                    person_id TEXT REFERENCES keeper_people(id) ON DELETE SET NULL,
                    title TEXT NOT NULL,
                    category TEXT NOT NULL,
                    status TEXT NOT NULL,
                    due_calendar TEXT,
                    due_ad TEXT,
                    due_bs_year INTEGER,
                    due_bs_month INTEGER,
                    due_bs_day INTEGER,
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
                INSERT INTO keeper_items_v4 SELECT
                    id, person_id, title, category, status, due_calendar, due_ad,
                    due_bs_year, due_bs_month, due_bs_day, recurrence, remind_days, note,
                    official_url, office_location, fee, application_status, checklist,
                    created_at, updated_at, completed_at
                FROM keeper_items;
                DROP TABLE keeper_items;
                ALTER TABLE keeper_items_v4 RENAME TO keeper_items;
                CREATE INDEX IF NOT EXISTS keeper_items_due_idx
                    ON keeper_items (due_ad, status);
                CREATE INDEX IF NOT EXISTS keeper_items_person_idx
                    ON keeper_items (person_id);
                COMMIT;",
            )
            .map_err(|error| error.to_string())?;
    }
    let has_details = table_columns(connection, "keeper_records")?
        .iter()
        .any(|(name, _)| name == "details");
    if !has_details {
        connection
            .execute(
                "ALTER TABLE keeper_records ADD COLUMN details TEXT NOT NULL DEFAULT '{}'",
                [],
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// v5: a record notifies on its own date instead of owning a hidden reminder
/// row, belongs to a family member, repeats (bluebook tax, premiums), and can
/// link to other records. The old `keeper-record-link-*` reminders hand their
/// remind days over and are removed.
fn migrate_keeper_v5(connection: &Connection) -> Result<()> {
    let has_person = table_columns(connection, "keeper_records")?
        .iter()
        .any(|(name, _)| name == "person_id");
    if has_person {
        return Ok(());
    }
    connection
        .execute_batch(
            "BEGIN;
            ALTER TABLE keeper_records ADD COLUMN person_id TEXT
                REFERENCES keeper_people(id) ON DELETE SET NULL;
            ALTER TABLE keeper_records ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none';
            ALTER TABLE keeper_records ADD COLUMN remind_days TEXT NOT NULL DEFAULT '[]';
            ALTER TABLE keeper_records ADD COLUMN links TEXT NOT NULL DEFAULT '[]';
            UPDATE keeper_records SET remind_days = COALESCE(
                (SELECT remind_days FROM keeper_items
                  WHERE keeper_items.id = 'keeper-record-link-' || keeper_records.id),
                '[30,7]')
              WHERE expiry_ad IS NOT NULL;
            UPDATE keeper_records SET recurrence = 'yearlyBs'
              WHERE document_type = 'bluebook' AND expiry_ad IS NOT NULL;
            UPDATE keeper_records SET recurrence = 'yearlyAd'
              WHERE document_type = 'insurance' AND expiry_ad IS NOT NULL;
            DELETE FROM keeper_items WHERE id LIKE 'keeper-record-link-%';
            COMMIT;",
        )
        .map_err(|error| error.to_string())
}

/// v6: a custom document's own label/value fields, kept in order.
fn migrate_keeper_v6(connection: &Connection) -> Result<()> {
    let has_fields = table_columns(connection, "keeper_records")?
        .iter()
        .any(|(name, _)| name == "custom_fields");
    if has_fields {
        return Ok(());
    }
    connection
        .execute(
            "ALTER TABLE keeper_records ADD COLUMN custom_fields TEXT NOT NULL DEFAULT '[]'",
            [],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

/// Tables are created with `IF NOT EXISTS`; any reshaping lives in the
/// versioned `migrate_*` steps above, so this only records the new number.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v3_keeper_data_survives_to_the_current_schema() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE schema_meta (key TEXT PRIMARY KEY NOT NULL, value INTEGER NOT NULL);
                INSERT INTO schema_meta VALUES ('schema_version', 3);
                CREATE TABLE keeper_people (
                    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL,
                    relationship TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE keeper_items (
                    id TEXT PRIMARY KEY NOT NULL,
                    person_id TEXT REFERENCES keeper_people(id) ON DELETE SET NULL,
                    title TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL,
                    due_calendar TEXT NOT NULL, due_ad TEXT NOT NULL,
                    due_bs_year INTEGER NOT NULL, due_bs_month INTEGER NOT NULL,
                    due_bs_day INTEGER NOT NULL, recurrence TEXT NOT NULL,
                    remind_days TEXT NOT NULL, note TEXT NOT NULL, official_url TEXT NOT NULL,
                    office_location TEXT NOT NULL, fee TEXT NOT NULL,
                    application_status TEXT NOT NULL, checklist TEXT NOT NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
                );
                INSERT INTO keeper_items VALUES ('a', NULL, 'Rent', 'home', 'active', 'ad',
                    '2026-10-01', 2083, 6, 15, 'monthly', '[7]', '', '', '', '', 'notStarted',
                    '[]', 'c', 'u', NULL);
                CREATE TABLE keeper_records (
                    id TEXT PRIMARY KEY NOT NULL, document_type TEXT NOT NULL,
                    number TEXT NOT NULL, issued_calendar TEXT, issued_ad TEXT,
                    issued_bs_year INTEGER, issued_bs_month INTEGER, issued_bs_day INTEGER,
                    expiry_calendar TEXT, expiry_ad TEXT, expiry_bs_year INTEGER,
                    expiry_bs_month INTEGER, expiry_bs_day INTEGER, office TEXT NOT NULL,
                    note TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                INSERT INTO keeper_records (id, document_type, number, office, note,
                    created_at, updated_at) VALUES ('r', 'pan', '123', '', '', 'c', 'u');
                INSERT INTO keeper_records (id, document_type, number, expiry_calendar,
                    expiry_ad, expiry_bs_year, expiry_bs_month, expiry_bs_day, office, note,
                    created_at, updated_at)
                    VALUES ('b', 'bluebook', 'Ba 1', 'bs', '2027-07-16', 2084, 3, 32, '', '',
                    'c', 'u');
                INSERT INTO keeper_items VALUES ('keeper-record-link-b', NULL, 'Bluebook renewal',
                    'identity', 'active', 'bs', '2027-07-16', 2084, 3, 32, 'none', '[14,1]', '',
                    '', '', '', 'notStarted', '[]', 'c', 'u', NULL);",
            )
            .unwrap();

        migrate(&connection).unwrap();
        // Idempotent: a second open must not rebuild or fail.
        migrate(&connection).unwrap();

        let title: String = connection
            .query_row("SELECT title FROM keeper_items WHERE id = 'a'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, "Rent");
        connection
            .execute(
                "INSERT INTO keeper_items (id, title, category, status, recurrence, remind_days,
                    note, official_url, office_location, fee, application_status, checklist,
                    created_at, updated_at)
                 VALUES ('b', 'Citizenship', 'identity', 'active', 'none', '[]', '', '', '', '',
                    'notStarted', '[]', 'c', 'u')",
                [],
            )
            .unwrap();
        let details: String = connection
            .query_row(
                "SELECT details FROM keeper_records WHERE id = 'r'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(details, "{}");
        let (recurrence, remind_days): (String, String) = connection
            .query_row(
                "SELECT recurrence, remind_days FROM keeper_records WHERE id = 'b'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(
            (recurrence.as_str(), remind_days.as_str()),
            ("yearlyBs", "[14,1]")
        );
        let leftover: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM keeper_items WHERE id LIKE 'keeper-record-link-%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(leftover, 0);
        let fields: String = connection
            .query_row(
                "SELECT custom_fields FROM keeper_records WHERE id = 'b'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(fields, "[]");
        assert_eq!(schema_version(&connection).unwrap(), SCHEMA_VERSION);
    }
}
