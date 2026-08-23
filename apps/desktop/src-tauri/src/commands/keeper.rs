//! Mero Keeper: private, offline-first household deadlines and documents.
//!
//! Dates are deliberately resolved here. The frontend can display both AD and
//! Bikram Sambat, but it never owns a second copy of the calendar engine.

use chrono::{Datelike, Duration, NaiveDate, TimeZone, Utc};
use rusqlite::params;
use sajilo_core::calendar::bikram_sambat::{gregorian_date_from, nepali_date_from};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Wry};

use crate::db;
use sajilo_core::notify::{LIMIT, PlannedNotification};

type Result<T> = std::result::Result<T, String>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeeperPerson {
    pub id: String,
    pub name: String,
    pub relationship: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeeperDateInput {
    pub calendar: String,
    pub year: i32,
    pub month: u32,
    pub day: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeeperDate {
    pub calendar: String,
    pub year: i32,
    pub month: u32,
    pub day: u32,
    pub ad: String,
    pub bs: KeeperBsDate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeeperBsDate {
    pub year: i32,
    pub month: u32,
    pub day: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeeperChecklistItem {
    pub id: String,
    pub label: String,
    pub checked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeeperItem {
    pub id: String,
    pub person_id: Option<String>,
    pub title: String,
    pub category: String,
    pub status: String,
    pub due_date: KeeperDate,
    pub recurrence: String,
    pub remind_days: Vec<u32>,
    pub note: String,
    pub official_url: String,
    pub office_location: String,
    pub fee: String,
    pub application_status: String,
    pub checklist: Vec<KeeperChecklistItem>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeeperRecord {
    pub id: String,
    /// One of "citizenship" | "passport" | "drivingLicence" | "nid" | "pan".
    pub document_type: String,
    pub number: String,
    /// Citizenship, NID, and PAN never expire; passports and driving
    /// licences do. Left `None` rather than guessed at.
    pub issued_date: Option<KeeperDate>,
    pub expiry_date: Option<KeeperDate>,
    pub office: String,
    pub note: String,
    /// The reminder auto-created from `expiry_date`, kept in sync with it.
    /// `None` when there is no expiry to track. Derived from `id`, not
    /// stored — see `linked_item_id`.
    pub linked_item_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeeperRecordInput {
    pub id: String,
    pub document_type: String,
    pub number: String,
    pub issued_date: Option<KeeperDateInput>,
    pub expiry_date: Option<KeeperDateInput>,
    pub office: String,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeeperSnapshot {
    pub people: Vec<KeeperPerson>,
    pub items: Vec<KeeperItem>,
    pub records: Vec<KeeperRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeeperReminder {
    pub id: String,
    pub title: String,
    pub body: String,
    pub fire_at: chrono::DateTime<Utc>,
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn parse_ad(value: &str) -> Result<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| "That date is not valid.".to_owned())
}

fn resolve_date(input: &KeeperDateInput) -> Result<(NaiveDate, sajilo_core::NepaliDate)> {
    if input.calendar == "bs" {
        let bs = sajilo_core::NepaliDate::new(input.year, input.month, input.day);
        let ad = gregorian_date_from(bs).map_err(|error| error.to_string())?;
        Ok((ad, bs))
    } else {
        let ad = NaiveDate::from_ymd_opt(input.year, input.month, input.day)
            .ok_or_else(|| "That Gregorian date is not valid.".to_owned())?;
        let bs = nepali_date_from(ad).map_err(|error| error.to_string())?;
        Ok((ad, bs))
    }
}

fn output_date(calendar: &str, ad: NaiveDate, bs: sajilo_core::NepaliDate) -> KeeperDate {
    let (year, month, day) = if calendar == "bs" {
        (bs.year, bs.month, bs.day)
    } else {
        (ad.year(), ad.month(), ad.day())
    };
    KeeperDate {
        calendar: calendar.to_owned(),
        year,
        month,
        day,
        ad: ad.to_string(),
        bs: KeeperBsDate {
            year: bs.year,
            month: bs.month,
            day: bs.day,
        },
    }
}

fn parse_json<T: for<'de> Deserialize<'de>>(raw: String) -> rusqlite::Result<T> {
    serde_json::from_str(&raw).map_err(|_| rusqlite::Error::InvalidQuery)
}

fn resolve_opt_date(
    input: Option<&KeeperDateInput>,
) -> Result<Option<(NaiveDate, sajilo_core::NepaliDate)>> {
    input.map(resolve_date).transpose()
}

fn output_opt_date(
    calendar: Option<String>,
    ad: Option<String>,
    bs_year: Option<i32>,
    bs_month: Option<u32>,
    bs_day: Option<u32>,
) -> Result<Option<KeeperDate>> {
    let (Some(calendar), Some(ad)) = (calendar, ad) else {
        return Ok(None);
    };
    let ad = parse_ad(&ad)?;
    let bs = sajilo_core::NepaliDate::new(
        bs_year.unwrap_or_default(),
        bs_month.unwrap_or_default(),
        bs_day.unwrap_or_default(),
    );
    Ok(Some(output_date(&calendar, ad, bs)))
}

/// The linked reminder's id is derived from the record's, not stored — a
/// record can own at most one reminder, so there is nothing a foreign key
/// would tell us that this doesn't already guarantee.
fn linked_item_id(record_id: &str) -> String {
    format!("keeper-record-link-{record_id}")
}

/// Citizenship, NID, and PAN never expire in Nepal; this title only ever
/// surfaces on the passport/driving-licence path where an expiry exists.
fn renewal_title(document_type: &str) -> &'static str {
    match document_type {
        "passport" => "Passport renewal",
        "drivingLicence" => "Driving licence renewal",
        "citizenship" => "Citizenship certificate renewal",
        "nid" => "National ID renewal",
        "pan" => "PAN renewal",
        _ => "Document renewal",
    }
}

fn people(app: &AppHandle<Wry>) -> Result<Vec<KeeperPerson>> {
    let connection = db::open(app)?;
    let mut statement = connection
        .prepare("SELECT id, name, relationship, created_at FROM keeper_people ORDER BY created_at")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(KeeperPerson {
                id: row.get(0)?,
                name: row.get(1)?,
                relationship: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

fn item_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<KeeperItem> {
    let calendar: String = row.get(4)?;
    let ad = parse_ad(&row.get::<_, String>(5)?).map_err(|_| rusqlite::Error::InvalidQuery)?;
    let bs = sajilo_core::NepaliDate::new(row.get(6)?, row.get(7)?, row.get(8)?);
    Ok(KeeperItem {
        id: row.get(0)?,
        person_id: row.get(1)?,
        title: row.get(2)?,
        category: row.get(3)?,
        status: row.get(9)?,
        due_date: output_date(&calendar, ad, bs),
        recurrence: row.get(10)?,
        remind_days: parse_json(row.get(11)?)?,
        note: row.get(12)?,
        official_url: row.get(13)?,
        office_location: row.get(14)?,
        fee: row.get(15)?,
        application_status: row.get(16)?,
        checklist: parse_json(row.get(17)?)?,
        created_at: row.get(18)?,
        updated_at: row.get(19)?,
        completed_at: row.get(20)?,
    })
}

fn record_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<(KeeperRecord, Result<()>)> {
    let id: String = row.get(0)?;
    let issued = output_opt_date(
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
    );
    let expiry = output_opt_date(
        row.get(8)?,
        row.get(9)?,
        row.get(10)?,
        row.get(11)?,
        row.get(12)?,
    );
    let (issued, issued_err) = match issued {
        Ok(value) => (value, Ok(())),
        Err(error) => (None, Err(error)),
    };
    let (expiry, expiry_err) = match expiry {
        Ok(value) => (value, Ok(())),
        Err(error) => (None, Err(error)),
    };
    let has_expiry = expiry.is_some();
    let record = KeeperRecord {
        linked_item_id: has_expiry.then(|| linked_item_id(&id)),
        document_type: row.get(1)?,
        number: row.get(2)?,
        issued_date: issued,
        expiry_date: expiry,
        office: row.get(13)?,
        note: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
        id,
    };
    Ok((record, issued_err.and(expiry_err)))
}

fn records(app: &AppHandle<Wry>) -> Result<Vec<KeeperRecord>> {
    let connection = db::open(app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, document_type, number, issued_calendar, issued_ad,
                issued_bs_year, issued_bs_month, issued_bs_day,
                expiry_calendar, expiry_ad, expiry_bs_year, expiry_bs_month, expiry_bs_day,
                office, note, created_at, updated_at
         FROM keeper_records ORDER BY created_at",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], record_from_row)
        .map_err(|error| error.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        let (record, parsed) = row.map_err(|error| error.to_string())?;
        parsed?;
        result.push(record);
    }
    Ok(result)
}

fn items(app: &AppHandle<Wry>) -> Result<Vec<KeeperItem>> {
    let connection = db::open(app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, person_id, title, category, due_calendar, due_ad,
                due_bs_year, due_bs_month, due_bs_day, status, recurrence,
                remind_days, note, official_url, office_location, fee,
                application_status, checklist, created_at, updated_at, completed_at
         FROM keeper_items ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, due_ad, title",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], item_from_row)
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn keeper_snapshot(app: AppHandle<Wry>) -> Result<KeeperSnapshot> {
    Ok(KeeperSnapshot {
        people: people(&app)?,
        items: items(&app)?,
        records: records(&app)?,
    })
}

#[tauri::command]
pub fn resolve_keeper_date(input: KeeperDateInput) -> Result<KeeperDate> {
    let (ad, bs) = resolve_date(&input)?;
    Ok(output_date(&input.calendar, ad, bs))
}

#[tauri::command]
pub fn save_keeper_person(app: AppHandle<Wry>, person: KeeperPerson) -> Result<KeeperSnapshot> {
    if person.name.trim().is_empty() {
        return Err("A family member needs a name.".to_owned());
    }
    let connection = db::open(&app)?;
    connection
        .execute(
            "INSERT INTO keeper_people (id, name, relationship, created_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, relationship = excluded.relationship",
            params![
                person.id,
                person.name.trim(),
                person.relationship.trim(),
                if person.created_at.is_empty() {
                    now()
                } else {
                    person.created_at
                }
            ],
        )
        .map_err(|error| error.to_string())?;
    keeper_snapshot(app)
}

#[tauri::command]
pub fn delete_keeper_person(app: AppHandle<Wry>, id: String) -> Result<KeeperSnapshot> {
    let connection = db::open(&app)?;
    connection
        .execute("DELETE FROM keeper_people WHERE id = ?1", [id])
        .map_err(|error| error.to_string())?;
    keeper_snapshot(app)
}

#[tauri::command]
pub fn save_keeper_item(app: AppHandle<Wry>, item: KeeperItem) -> Result<KeeperSnapshot> {
    if item.title.trim().is_empty() {
        return Err("Give this reminder a name first.".to_owned());
    }
    let (ad, bs) = resolve_date(&KeeperDateInput {
        calendar: item.due_date.calendar.clone(),
        year: item.due_date.year,
        month: item.due_date.month,
        day: item.due_date.day,
    })?;
    let created = if item.created_at.is_empty() {
        now()
    } else {
        item.created_at.clone()
    };
    let updated = now();
    let checklist = serde_json::to_string(&item.checklist).map_err(|error| error.to_string())?;
    let remind_days =
        serde_json::to_string(&item.remind_days).map_err(|error| error.to_string())?;
    let completed_at = if item.status == "completed" {
        Some(item.completed_at.unwrap_or_else(now))
    } else {
        None
    };
    let connection = db::open(&app)?;
    connection.execute(
        "INSERT INTO keeper_items
          (id, person_id, title, category, status, due_calendar, due_ad,
           due_bs_year, due_bs_month, due_bs_day, recurrence, remind_days, note,
           official_url, office_location, fee, application_status, checklist,
           created_at, updated_at, completed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
         ON CONFLICT(id) DO UPDATE SET person_id=excluded.person_id, title=excluded.title,
           category=excluded.category, status=excluded.status, due_calendar=excluded.due_calendar,
           due_ad=excluded.due_ad, due_bs_year=excluded.due_bs_year, due_bs_month=excluded.due_bs_month,
           due_bs_day=excluded.due_bs_day, recurrence=excluded.recurrence, remind_days=excluded.remind_days,
           note=excluded.note, official_url=excluded.official_url, office_location=excluded.office_location,
           fee=excluded.fee, application_status=excluded.application_status, checklist=excluded.checklist,
           updated_at=excluded.updated_at, completed_at=excluded.completed_at",
        params![item.id, item.person_id, item.title.trim(), item.category, item.status, item.due_date.calendar,
            ad.to_string(), bs.year, bs.month, bs.day, item.recurrence, remind_days, item.note,
            item.official_url, item.office_location, item.fee, item.application_status, checklist,
            created, updated, completed_at],
    ).map_err(|error| error.to_string())?;
    keeper_snapshot(app)
}

#[tauri::command]
pub fn delete_keeper_item(app: AppHandle<Wry>, id: String) -> Result<KeeperSnapshot> {
    let connection = db::open(&app)?;
    connection
        .execute("DELETE FROM keeper_items WHERE id = ?1", [id])
        .map_err(|error| error.to_string())?;
    keeper_snapshot(app)
}

#[tauri::command]
pub fn save_keeper_record(
    app: AppHandle<Wry>,
    record: KeeperRecordInput,
) -> Result<KeeperSnapshot> {
    if record.number.trim().is_empty() {
        return Err("Give this document a number first.".to_owned());
    }
    let issued = resolve_opt_date(record.issued_date.as_ref())?;
    let expiry = resolve_opt_date(record.expiry_date.as_ref())?;
    let created = if record.created_at.is_empty() {
        now()
    } else {
        record.created_at.clone()
    };
    let updated = now();

    let connection = db::open(&app)?;
    connection
        .execute(
            "INSERT INTO keeper_records
          (id, document_type, number, issued_calendar, issued_ad,
           issued_bs_year, issued_bs_month, issued_bs_day,
           expiry_calendar, expiry_ad, expiry_bs_year, expiry_bs_month, expiry_bs_day,
           office, note, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
         ON CONFLICT(id) DO UPDATE SET document_type=excluded.document_type, number=excluded.number,
           issued_calendar=excluded.issued_calendar, issued_ad=excluded.issued_ad,
           issued_bs_year=excluded.issued_bs_year, issued_bs_month=excluded.issued_bs_month,
           issued_bs_day=excluded.issued_bs_day, expiry_calendar=excluded.expiry_calendar,
           expiry_ad=excluded.expiry_ad, expiry_bs_year=excluded.expiry_bs_year,
           expiry_bs_month=excluded.expiry_bs_month, expiry_bs_day=excluded.expiry_bs_day,
           office=excluded.office, note=excluded.note, updated_at=excluded.updated_at",
            params![
                record.id,
                record.document_type,
                record.number.trim(),
                record.issued_date.as_ref().map(|d| d.calendar.clone()),
                issued.map(|(ad, _)| ad.to_string()),
                issued.map(|(_, bs)| bs.year),
                issued.map(|(_, bs)| bs.month),
                issued.map(|(_, bs)| bs.day),
                record.expiry_date.as_ref().map(|d| d.calendar.clone()),
                expiry.map(|(ad, _)| ad.to_string()),
                expiry.map(|(_, bs)| bs.year),
                expiry.map(|(_, bs)| bs.month),
                expiry.map(|(_, bs)| bs.day),
                record.office.trim(),
                record.note.trim(),
                created,
                updated,
            ],
        )
        .map_err(|error| error.to_string())?;

    let link_id = linked_item_id(&record.id);
    match (record.expiry_date.as_ref(), expiry) {
        (Some(input), Some((ad, bs))) => {
            let due_date = output_date(&input.calendar, ad, bs);
            save_keeper_item(
                app.clone(),
                KeeperItem {
                    id: link_id,
                    person_id: None,
                    title: renewal_title(&record.document_type).to_owned(),
                    category: "identity".to_owned(),
                    status: "active".to_owned(),
                    due_date,
                    recurrence: "none".to_owned(),
                    remind_days: vec![30, 7, 1],
                    note: String::new(),
                    official_url: String::new(),
                    office_location: record.office.clone(),
                    fee: String::new(),
                    application_status: "notStarted".to_owned(),
                    checklist: Vec::new(),
                    created_at: String::new(),
                    updated_at: String::new(),
                    completed_at: None,
                },
            )?;
        }
        _ => {
            connection
                .execute("DELETE FROM keeper_items WHERE id = ?1", [link_id])
                .map_err(|error| error.to_string())?;
        }
    }

    keeper_snapshot(app)
}

#[tauri::command]
pub fn delete_keeper_record(app: AppHandle<Wry>, id: String) -> Result<KeeperSnapshot> {
    let connection = db::open(&app)?;
    connection
        .execute(
            "DELETE FROM keeper_items WHERE id = ?1",
            [linked_item_id(&id)],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM keeper_records WHERE id = ?1", [id])
        .map_err(|error| error.to_string())?;
    keeper_snapshot(app)
}

fn month_date(year: i32, month: u32, day: u32) -> NaiveDate {
    (1..=day)
        .rev()
        .find_map(|candidate| NaiveDate::from_ymd_opt(year, month, candidate))
        .unwrap_or_else(|| NaiveDate::from_ymd_opt(year, month, 1).expect("valid month"))
}

fn next_due(item: &KeeperItem, today: NaiveDate) -> Option<NaiveDate> {
    let original = parse_ad(&item.due_date.ad).ok()?;
    match item.recurrence.as_str() {
        "monthly" => {
            let mut year = today.year();
            let mut month = today.month();
            for _ in 0..24 {
                let candidate = month_date(year, month, original.day());
                if candidate >= today {
                    return Some(candidate);
                }
                if month == 12 {
                    year += 1;
                    month = 1;
                } else {
                    month += 1;
                }
            }
            None
        }
        "yearlyBs" => {
            let today_bs = nepali_date_from(today).ok()?;
            for year in today_bs.year..=today_bs.year + 2 {
                if let Ok(candidate) = gregorian_date_from(sajilo_core::NepaliDate::new(
                    year,
                    item.due_date.bs.month,
                    item.due_date.bs.day,
                )) && candidate >= today
                {
                    return Some(candidate);
                }
            }
            None
        }
        "yearlyAd" => (today.year()..=today.year() + 2)
            .map(|year| month_date(year, original.month(), original.day()))
            .find(|date| *date >= today),
        _ => (original >= today).then_some(original),
    }
}

pub fn pending_notifications(
    app: &AppHandle<Wry>,
    now: chrono::DateTime<Utc>,
) -> Vec<PlannedNotification> {
    let today = now
        .with_timezone(&sajilo_core::nepal_time::offset())
        .date_naive();
    let names = people(app)
        .unwrap_or_default()
        .into_iter()
        .map(|person| (person.id, person.name))
        .collect::<std::collections::HashMap<_, _>>();
    let mut result = Vec::new();
    for item in items(app)
        .unwrap_or_default()
        .into_iter()
        .filter(|item| item.status == "active")
    {
        let Some(due) = next_due(&item, today) else {
            continue;
        };
        for days in item.remind_days.iter().copied() {
            let fire_date = due - Duration::days(i64::from(days));
            let Some(naive) = fire_date.and_hms_opt(9, 0, 0) else {
                continue;
            };
            let Some(fire_at) = sajilo_core::nepal_time::offset()
                .from_local_datetime(&naive)
                .single()
                .map(|date| date.with_timezone(&Utc))
            else {
                continue;
            };
            if fire_at <= now {
                continue;
            }
            let person = item
                .person_id
                .as_deref()
                .and_then(|id| names.get(id))
                .map_or("", String::as_str);
            result.push(PlannedNotification {
                id: format!("sajilo.keeper.{}.{}", item.id, days),
                title: item.title.clone(),
                body: if person.is_empty() {
                    format!("Due in {days} days")
                } else {
                    format!("{person} · due in {days} days")
                },
                fire_at,
            });
        }
    }
    result.sort_by_key(|item| item.fire_at);
    result.truncate(LIMIT);
    result
}
