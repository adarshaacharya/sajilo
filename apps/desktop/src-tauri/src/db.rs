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
pub const SCHEMA_VERSION: i64 = 9;

pub type Result<T> = std::result::Result<T, String>;

fn database_path(app: &AppHandle<Wry>) -> Result<PathBuf> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join(DATABASE_FILE))
}

/// The schema version of data a newer Sajilo wrote, if the database on disk
/// is ahead of this build. Read without migrating anything, so an older app
/// opened by mistake leaves the data exactly as it found it.
pub fn written_by_newer(app: &AppHandle<Wry>) -> Option<i64> {
    let path = database_path(app).ok()?;
    if !path.exists() {
        return None;
    }
    let connection =
        Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
    schema_version(&connection)
        .ok()
        .filter(|version| *version > SCHEMA_VERSION)
}

pub fn open(app: &AppHandle<Wry>) -> Result<Connection> {
    let connection = Connection::open(database_path(app)?).map_err(|error| error.to_string())?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| error.to_string())?;
    migrate(&connection)?;
    Ok(connection)
}

/// Tables that have not changed shape since they were introduced.
const BASE_TABLES: &str = "
            CREATE TABLE IF NOT EXISTS schema_meta (
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
";

/// Keeper, in its current shape. Created on a fresh database, and recreated
/// wholesale by `upgrade` — see there.
const KEEPER_TABLES: &str = "
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
                completed_at TEXT,
                template TEXT,
                repeat_day INTEGER
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
                custom_fields TEXT NOT NULL DEFAULT '[]',
                repeat_day INTEGER
            );
            CREATE TABLE IF NOT EXISTS keeper_attachments (
                id TEXT PRIMARY KEY NOT NULL,
                owner_kind TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                image BLOB NOT NULL,
                thumbnail BLOB NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS keeper_attachments_owner_idx
                ON keeper_attachments (owner_kind, owner_id);
";

/// Personal NEPSE activity. Integer paisa avoids cumulative rounding drift;
/// derived WACC and P/L are rebuilt from these rows whenever they are read.
const STOCK_PORTFOLIO_TABLES: &str = "
            CREATE TABLE IF NOT EXISTS stock_transactions (
                id TEXT PRIMARY KEY NOT NULL,
                symbol TEXT NOT NULL,
                kind TEXT NOT NULL CHECK (kind IN ('purchase', 'sale')),
                trade_date TEXT NOT NULL,
                quantity INTEGER NOT NULL CHECK (quantity > 0),
                price_paisa INTEGER NOT NULL CHECK (price_paisa >= 0),
                fees_paisa INTEGER NOT NULL CHECK (fees_paisa >= 0),
                tax_paisa INTEGER NOT NULL CHECK (tax_paisa >= 0),
                fees_estimated INTEGER NOT NULL,
                tax_estimated INTEGER NOT NULL,
                source TEXT,
                note TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS stock_transactions_symbol_date_idx
                ON stock_transactions (symbol, trade_date, created_at);
";

fn migrate(connection: &Connection) -> Result<()> {
    connection
        .execute_batch(&format!(
            "{BASE_TABLES}{KEEPER_TABLES}{STOCK_PORTFOLIO_TABLES}
            INSERT INTO schema_meta (key, value)
                VALUES ('schema_version', 1)
                ON CONFLICT(key) DO NOTHING;"
        ))
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
    ensure_repeat_day(connection)
}

/// The day a repeating Keeper date was set for, so a bill on the 30th that
/// lands on a 29-day month goes back to the 30th after it.
///
/// Checked on every open rather than as a version step: development builds
/// marked some databases version 9 before this column existed, and a version
/// check alone would leave those without it. Adding a missing nullable column
/// is safe to repeat, and the check is one PRAGMA per table.
fn ensure_repeat_day(connection: &Connection) -> Result<()> {
    for table in ["keeper_items", "keeper_records"] {
        if !has_column(connection, table, "repeat_day")? {
            connection
                .execute_batch(&format!(
                    "ALTER TABLE {table} ADD COLUMN repeat_day INTEGER;"
                ))
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

/// Brings a database from `from` up to `SCHEMA_VERSION`, one step per version.
///
/// Every step after 7 must carry existing rows forward: `ALTER TABLE … ADD
/// COLUMN` with a default, or create the new table, copy rows across, then
/// drop the old one — never a bare `DROP TABLE`. An app update is not
/// supposed to cost anyone their Keeper documents, photos or day plans, and
/// people skip releases, so a step also runs for someone jumping several
/// versions at once. Add a test beside the existing ones that opens a
/// database at the old version with rows in it and checks those rows survive.
fn upgrade(connection: &Connection, from: i64) -> Result<()> {
    // The one exception, and it stays the only one. Keeper was reshaped
    // before anyone kept anything in it (optional due
    // dates, document owners and cycles, custom fields, reminder templates),
    // so its two changed tables are rebuilt rather than migrated column by
    // column. Family profiles kept their shape and are left alone.
    if from < 7 {
        connection
            .execute_batch(&format!(
                "BEGIN;
                DROP TABLE IF EXISTS keeper_items;
                DROP TABLE IF EXISTS keeper_records;
                DROP TABLE IF EXISTS keeper_attachments;
                {KEEPER_TABLES}
                COMMIT;"
            ))
            .map_err(|error| error.to_string())?;
    }
    if from < 8 {
        connection
            .execute_batch(STOCK_PORTFOLIO_TABLES)
            .map_err(|error| error.to_string())?;
    }
    bump_schema_version(connection, SCHEMA_VERSION)
}

fn has_column(connection: &Connection, table: &str, column: &str) -> Result<bool> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|error| error.to_string())?;
    let names = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())?;
    Ok(names.iter().any(|name| name == column))
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

    fn columns(connection: &Connection, table: &str) -> Vec<String> {
        let mut statement = connection
            .prepare(&format!("PRAGMA table_info({table})"))
            .unwrap();
        statement
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap()
    }

    #[test]
    fn an_old_keeper_is_rebuilt_in_the_current_shape() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE schema_meta (key TEXT PRIMARY KEY NOT NULL, value INTEGER NOT NULL);
                INSERT INTO schema_meta VALUES ('schema_version', 3);
                CREATE TABLE keeper_people (
                    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL,
                    relationship TEXT NOT NULL, created_at TEXT NOT NULL
                );
                INSERT INTO keeper_people VALUES ('p', 'Aama', 'mother', 'c');
                CREATE TABLE keeper_items (
                    id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL,
                    due_ad TEXT NOT NULL, status TEXT NOT NULL, person_id TEXT
                );
                CREATE TABLE keeper_records (
                    id TEXT PRIMARY KEY NOT NULL, document_type TEXT NOT NULL
                );",
            )
            .unwrap();

        migrate(&connection).unwrap();
        // Idempotent: a second open neither fails nor rebuilds again.
        migrate(&connection).unwrap();

        assert!(columns(&connection, "keeper_items").contains(&"template".to_owned()));
        assert!(columns(&connection, "keeper_records").contains(&"custom_fields".to_owned()));
        let people: i64 = connection
            .query_row("SELECT COUNT(*) FROM keeper_people", [], |row| row.get(0))
            .unwrap();
        assert_eq!(people, 1, "family profiles are kept");
        assert_eq!(schema_version(&connection).unwrap(), SCHEMA_VERSION);
    }

    #[test]
    fn a_fresh_database_opens_at_the_current_version() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        assert_eq!(schema_version(&connection).unwrap(), SCHEMA_VERSION);
        assert!(columns(&connection, "keeper_items").contains(&"template".to_owned()));
        assert!(columns(&connection, "stock_transactions").contains(&"price_paisa".to_owned()));
    }

    #[test]
    fn version_seven_gains_portfolio_storage_without_touching_existing_data() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE schema_meta (key TEXT PRIMARY KEY NOT NULL, value INTEGER NOT NULL);
                INSERT INTO schema_meta VALUES ('schema_version', 7);
                CREATE TABLE keeper_people (
                    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL,
                    relationship TEXT NOT NULL, created_at TEXT NOT NULL
                );
                INSERT INTO keeper_people VALUES ('p', 'Aama', 'mother', 'c');",
            )
            .unwrap();
        migrate(&connection).unwrap();
        let people: i64 = connection
            .query_row("SELECT COUNT(*) FROM keeper_people", [], |row| row.get(0))
            .unwrap();
        assert_eq!(people, 1);
        assert!(columns(&connection, "stock_transactions").contains(&"symbol".to_owned()));
    }

    /// A database already stamped version 9 before `repeat_day` existed still
    /// gets the column, instead of failing every Keeper query.
    #[test]
    fn a_version_nine_database_missing_repeat_day_gains_it() {
        let connection = Connection::open_in_memory().unwrap();
        let old_shape = KEEPER_TABLES.replace(",\n                repeat_day INTEGER", "");
        connection
            .execute_batch(&format!(
                "CREATE TABLE schema_meta (key TEXT PRIMARY KEY NOT NULL, value INTEGER NOT NULL);
                INSERT INTO schema_meta VALUES ('schema_version', 9);
                {old_shape}"
            ))
            .unwrap();

        migrate(&connection).unwrap();

        assert!(columns(&connection, "keeper_items").contains(&"repeat_day".to_owned()));
        assert!(columns(&connection, "keeper_records").contains(&"repeat_day".to_owned()));
    }

    #[test]
    fn version_eight_keeps_keeper_rows_and_gains_repeat_day() {
        let connection = Connection::open_in_memory().unwrap();
        // A version-8 Keeper: today's shape without `repeat_day`.
        let old_shape = KEEPER_TABLES.replace(",\n                repeat_day INTEGER", "");
        assert!(!old_shape.contains("repeat_day"));
        connection
            .execute_batch(&format!(
                "CREATE TABLE schema_meta (key TEXT PRIMARY KEY NOT NULL, value INTEGER NOT NULL);
                INSERT INTO schema_meta VALUES ('schema_version', 8);
                {old_shape}
                INSERT INTO keeper_items (id, title, category, status, recurrence, remind_days,
                    note, official_url, office_location, fee, application_status, checklist,
                    created_at, updated_at)
                VALUES ('i', 'Rent', 'home', 'active', 'monthly', '[]', '', '', '', '', '', '[]',
                    'c', 'u');"
            ))
            .unwrap();

        migrate(&connection).unwrap();
        migrate(&connection).unwrap();

        assert!(columns(&connection, "keeper_items").contains(&"repeat_day".to_owned()));
        assert!(columns(&connection, "keeper_records").contains(&"repeat_day".to_owned()));
        let title: String = connection
            .query_row("SELECT title FROM keeper_items WHERE id = 'i'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, "Rent", "existing reminders survive");
        assert_eq!(schema_version(&connection).unwrap(), SCHEMA_VERSION);
    }
}
