//! Day-plan persistence backed by the shared local SQLite database.

use chrono::{DateTime, Utc};
use rusqlite::params;
use sajilo_core::NepaliDate;
use sajilo_core::planner::{DayPlan, PlanTime, Recurrence, Reminder, plan_days_in_month, plans_on};
use sajilo_core::quick_plan::{QuickKind, QuickPlan};
use tauri::{AppHandle, Wry};

use crate::db;

type Result<T> = std::result::Result<T, String>;

/// The stored spelling, matching the serde name so backups and the table agree.
fn recurrence_name(recurrence: Recurrence) -> &'static str {
    match recurrence {
        Recurrence::None => "none",
        Recurrence::MonthlyBikramSambat => "monthlyBikramSambat",
        Recurrence::YearlyBikramSambat => "yearlyBikramSambat",
    }
}

/// Anything unrecognised reads as one-time rather than failing the whole load.
fn recurrence_from(name: &str) -> Recurrence {
    match name {
        "monthlyBikramSambat" => Recurrence::MonthlyBikramSambat,
        "yearlyBikramSambat" => Recurrence::YearlyBikramSambat,
        _ => Recurrence::None,
    }
}

fn done_json(plan: &DayPlan) -> String {
    serde_json::to_string(&plan.done).unwrap_or_else(|_| "[]".to_owned())
}

fn load(app: &AppHandle<Wry>) -> Result<Vec<DayPlan>> {
    let connection = db::open(app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, year, month, day, title, time_hour, time_minute,
                    reminder, note, recurrence, created_at, done_dates
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
                recurrence: recurrence_from(&row.get::<_, String>(9)?),
                created_at: row
                    .get::<_, String>(10)?
                    .parse::<DateTime<Utc>>()
                    .map_err(|_| rusqlite::Error::InvalidQuery)?,
                // A list that won't read is as good as nothing ticked.
                done: serde_json::from_str(&row.get::<_, String>(11)?).unwrap_or_default(),
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
                 note, recurrence, created_at, done_dates)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(id) DO UPDATE SET
                year = excluded.year, month = excluded.month, day = excluded.day,
                title = excluded.title, time_hour = excluded.time_hour,
                time_minute = excluded.time_minute, reminder = excluded.reminder,
                note = excluded.note, recurrence = excluded.recurrence,
                created_at = excluded.created_at, done_dates = excluded.done_dates",
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
                recurrence_name(plan.recurrence),
                plan.created_at.to_rfc3339(),
                done_json(plan),
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

/// The days of a BS month the calendar grid marks, repeating plans included.
#[tauri::command]
pub fn plan_days(app: AppHandle<Wry>, year: i32, month: u32) -> Result<Vec<u32>> {
    Ok(plan_days_in_month(&load(&app)?, year, month))
}

#[tauri::command]
pub fn save_plan(app: AppHandle<Wry>, plan: DayPlan) -> Result<Vec<DayPlan>> {
    let plan = plan.normalised();
    save(&app, &plan)?;
    crate::commands::notify::reschedule();
    load(&app)
}

/// Ticks a plan off (or back on) for one day: the occurrence on that date.
#[tauri::command]
pub fn set_plan_done(
    app: AppHandle<Wry>,
    id: String,
    year: i32,
    month: u32,
    day: u32,
    done: bool,
) -> Result<Vec<DayPlan>> {
    let mut plan = load(&app)?
        .into_iter()
        .find(|plan| plan.id == id)
        .ok_or("That plan no longer exists.")?;
    plan.set_done_on(NepaliDate::new(year, month, day), done);
    save(&app, &plan)?;
    crate::commands::notify::reschedule();
    load(&app)
}

/// Reads a plan typed as one line: the title, and the time, reminder and
/// repeat picked out of it, each with the words it came from. `ignore` keeps
/// the kinds the user dismissed in the title.
#[tauri::command]
pub fn quick_plan(line: String, ignore: Vec<QuickKind>) -> Result<QuickPlan> {
    let line = sajilo_core::limits::clip(&line, sajilo_core::limits::TITLE * 2);
    // Day words ("tomorrow", "Friday") count from Nepal's today, as the
    // calendar does, whatever the computer's own zone.
    let today =
        sajilo_core::calendar::bikram_sambat::nepali_date_from(sajilo_core::nepal_time::today())
            .map_err(|error| error.to_string())?;
    Ok(sajilo_core::quick_plan::quick_plan(&line, &ignore, today))
}

#[tauri::command]
pub fn delete_plan(app: AppHandle<Wry>, id: String) -> Result<Vec<DayPlan>> {
    let connection = db::open(&app)?;
    connection
        .execute("DELETE FROM day_plans WHERE id = ?1", [id])
        .map_err(|error| error.to_string())?;
    crate::commands::notify::reschedule();
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
                     note, recurrence, created_at, done_dates)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
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
                    recurrence_name(plan.recurrence),
                    plan.created_at.to_rfc3339(),
                    done_json(plan),
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())
}
