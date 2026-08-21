//! Day-plan persistence backed by the shared local SQLite database.

use chrono::{DateTime, Utc};
use rusqlite::params;
use sajilo_core::NepaliDate;
use sajilo_core::planner::{DayPlan, PlanTime, Recurrence, Reminder, plans_on};
use tauri::{AppHandle, Wry};

use crate::db;

type Result<T> = std::result::Result<T, String>;

fn load(app: &AppHandle<Wry>) -> Result<Vec<DayPlan>> {
    let connection = db::open(app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, year, month, day, title, time_hour, time_minute,
                    reminder, note, recurrence, created_at
             FROM day_plans ORDER BY year, month, day, time_hour, time_minute, created_at",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(DayPlan {
                id: row.get(0)?,
                date: NepaliDate::new(row.get(1)?, row.get(2)?, row.get(3)?),
                title: row.get(4)?,
                time: match (row.get::<_, Option<u32>>(5)?, row.get::<_, Option<u32>>(6)?) {
                    (Some(hour), Some(minute)) => Some(PlanTime { hour, minute }),
                    _ => None,
                },
                reminder: row.get::<_, Option<u32>>(7)?.map(Reminder),
                note: row.get(8)?,
                recurrence: match row.get::<_, String>(9)?.as_str() {
                    "yearlyBikramSambat" => Recurrence::YearlyBikramSambat,
                    _ => Recurrence::None,
                },
                created_at: row
                    .get::<_, String>(10)?
                    .parse::<DateTime<Utc>>()
                    .map_err(|_| rusqlite::Error::InvalidQuery)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn save(app: &AppHandle<Wry>, plan: &DayPlan) -> Result<()> {
    let mut connection = db::open(app)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO day_plans
                (id, year, month, day, title, time_hour, time_minute, reminder,
                 note, recurrence, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET
                year = excluded.year, month = excluded.month, day = excluded.day,
                title = excluded.title, time_hour = excluded.time_hour,
                time_minute = excluded.time_minute, reminder = excluded.reminder,
                note = excluded.note, recurrence = excluded.recurrence,
                created_at = excluded.created_at",
            params![
                plan.id,
                plan.date.year,
                plan.date.month,
                plan.date.day,
                plan.title,
                plan.time.map(|time| time.hour),
                plan.time.map(|time| time.minute),
                plan.reminder.map(|reminder| reminder.0),
                plan.note,
                match plan.recurrence {
                    Recurrence::YearlyBikramSambat => "yearlyBikramSambat",
                    Recurrence::None => "none",
                },
                plan.created_at.to_rfc3339(),
            ],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_plans(app: AppHandle<Wry>) -> Result<Vec<DayPlan>> {
    load(&app)
}

#[tauri::command]
pub fn plans_for_day(app: AppHandle<Wry>, year: i32, month: u32, day: u32) -> Result<Vec<DayPlan>> {
    Ok(plans_on(&load(&app)?, NepaliDate::new(year, month, day)))
}

#[tauri::command]
pub fn save_plan(app: AppHandle<Wry>, plan: DayPlan) -> Result<Vec<DayPlan>> {
    let plan = plan.normalised();
    save(&app, &plan)?;
    load(&app)
}

#[tauri::command]
pub fn delete_plan(app: AppHandle<Wry>, id: String) -> Result<Vec<DayPlan>> {
    let connection = db::open(&app)?;
    connection
        .execute("DELETE FROM day_plans WHERE id = ?1", [id])
        .map_err(|error| error.to_string())?;
    load(&app)
}

pub fn all_for_backup(app: &AppHandle<Wry>) -> Result<Vec<DayPlan>> {
    load(app)
}

pub fn replace_all(app: &AppHandle<Wry>, plans: &[DayPlan]) -> Result<()> {
    let mut connection = db::open(app)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM day_plans", [])
        .map_err(|error| error.to_string())?;
    for plan in plans {
        transaction
            .execute(
                "INSERT INTO day_plans
                    (id, year, month, day, title, time_hour, time_minute, reminder,
                     note, recurrence, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    plan.id,
                    plan.date.year,
                    plan.date.month,
                    plan.date.day,
                    plan.title,
                    plan.time.map(|time| time.hour),
                    plan.time.map(|time| time.minute),
                    plan.reminder.map(|reminder| reminder.0),
                    plan.note,
                    match plan.recurrence {
                        Recurrence::YearlyBikramSambat => "yearlyBikramSambat",
                        Recurrence::None => "none",
                    },
                    plan.created_at.to_rfc3339(),
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())
}
