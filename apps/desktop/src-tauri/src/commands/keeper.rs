//! Mero Keeper: private, offline-first household deadlines and documents.
//!
//! Dates are deliberately resolved here. The frontend can display both AD and
//! Bikram Sambat, but it never owns a second copy of the calendar engine.

use std::collections::BTreeMap;

use chrono::{Datelike, Duration, Months, NaiveDate, TimeZone, Utc};
use rusqlite::{OptionalExtension, params};
use sajilo_core::calendar::bikram_sambat::{
    day_months_later, gregorian_date_from, nepali_date_from,
};
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
    /// `भदौ` — from the calendar engine, so the UI never names a BS month
    /// itself. Ignored on the way in.
    #[serde(default)]
    pub month_name: String,
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
    /// `None` for things with no deadline of their own, such as applying for
    /// a citizenship certificate. Undated items never notify.
    pub due_date: Option<KeeperDate>,
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
    /// The template it was started from ("electricity", "subscription"), if
    /// any. Only used to group reminders of one kind.
    #[serde(default)]
    pub template: Option<String>,
    /// See [`KeeperRecord::repeat_day`].
    #[serde(skip)]
    pub repeat_day: Option<u32>,
}

/// A document the household holds. Some are only a record (citizenship, NID,
/// PAN never expire); others carry a date that needs action — a passport's
/// expiry, a bluebook's yearly tax, a life policy's premium — and notify on
/// their own. There is no separate reminder behind a record.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeeperRecord {
    pub id: String,
    /// One of "citizenship" | "passport" | "drivingLicence" | "nid" | "pan" |
    /// "bluebook" | "insurance" | "warranty".
    pub document_type: String,
    /// Whose document this is; `None` for the user / the household.
    pub person_id: Option<String>,
    /// The type's primary identifier: document number, vehicle registration
    /// number (bluebook), policy number (insurance), or serial/IMEI (warranty).
    pub number: String,
    /// For insurance this is the policy start, for a warranty the purchase
    /// date.
    pub issued_date: Option<KeeperDate>,
    /// When the document next needs action: expiry, tax due, premium due, or
    /// the day a warranty ends. `None` for documents that never expire.
    pub expiry_date: Option<KeeperDate>,
    /// How `expiry_date` moves when the user marks it paid or renewed:
    /// "none" | "monthly" | "monthlyBs" | "quarterly" | "halfYearly" |
    /// "yearlyAd" | "yearlyBs". Plain "monthly" is AD months.
    pub recurrence: String,
    /// Days before `expiry_date` to notify.
    pub remind_days: Vec<u32>,
    pub office: String,
    pub note: String,
    /// Type-specific fields (e.g. `chassisNumber`, `insurer`, `product`).
    /// Free-form so a new field is a frontend change, not a migration.
    pub details: BTreeMap<String, String>,
    /// Other records this one points at (a bluebook's insurance policy).
    /// Stored one way; the frontend shows the reverse side too.
    pub links: Vec<String>,
    /// The user's own label/value pairs on a custom document, in their order.
    pub custom_fields: Vec<KeeperField>,
    pub created_at: String,
    pub updated_at: String,
    /// The day of the month a repeating date was set for, in the repeat's own
    /// calendar. Kept apart from the date itself, which is clamped whenever a
    /// month is too short: a bill on the 30th due in a 29-day month is due on
    /// the 29th, and the one after is due on the 30th again. Backend-only.
    #[serde(skip)]
    pub repeat_day: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeeperRecordInput {
    pub id: String,
    pub document_type: String,
    #[serde(default)]
    pub person_id: Option<String>,
    pub number: String,
    pub issued_date: Option<KeeperDateInput>,
    pub expiry_date: Option<KeeperDateInput>,
    #[serde(default = "no_recurrence")]
    pub recurrence: String,
    #[serde(default)]
    pub remind_days: Vec<u32>,
    pub office: String,
    pub note: String,
    #[serde(default)]
    pub details: BTreeMap<String, String>,
    #[serde(default)]
    pub links: Vec<String>,
    #[serde(default)]
    pub custom_fields: Vec<KeeperField>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KeeperField {
    pub label: String,
    pub value: String,
}

fn no_recurrence() -> String {
    "none".to_owned()
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
            month_name: bs.nepali_month_name().to_owned(),
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

const RECORD_RECURRENCES: [&str; 7] = [
    "none",
    "monthly",
    "monthlyBs",
    "quarterly",
    "halfYearly",
    "yearlyAd",
    "yearlyBs",
];

fn detail<'a>(details: &'a BTreeMap<String, String>, key: &str) -> &'a str {
    details.get(key).map_or("", |value| value.trim())
}

/// The field a record cannot be saved without. A warranty is known by its
/// product — plenty of bills never print a serial number.
fn missing_identity(record: &KeeperRecordInput) -> Option<&'static str> {
    match record.document_type.as_str() {
        "warranty" if detail(&record.details, "product").is_empty() => {
            Some("Name the product this warranty covers first.")
        }
        "warranty" => None,
        "custom" if detail(&record.details, "name").is_empty() => Some("Name this document first."),
        "custom" => None,
        "bluebook" if record.number.trim().is_empty() => Some("Add the vehicle number first."),
        "insurance" if record.number.trim().is_empty() => Some("Add the policy number first."),
        _ if record.number.trim().is_empty() => Some("Give this document a number first."),
        _ => None,
    }
}

/// The notification title for a record's date.
fn record_title(record: &KeeperRecord) -> String {
    let with = |base: &str, suffix: &str| {
        if suffix.is_empty() {
            base.to_owned()
        } else {
            format!("{base} · {suffix}")
        }
    };
    match record.document_type.as_str() {
        "passport" => "Passport renewal".to_owned(),
        "drivingLicence" => "Driving licence renewal".to_owned(),
        "bluebook" => with("Bluebook tax", record.number.trim()),
        "insurance" if detail(&record.details, "insuranceType") == "life" => {
            with("Insurance premium", detail(&record.details, "insurer"))
        }
        "insurance" => with("Insurance renewal", detail(&record.details, "insurer")),
        "warranty" => with("Warranty ends", detail(&record.details, "product")),
        "custom" => detail(&record.details, "name").to_owned(),
        _ => "Document renewal".to_owned(),
    }
}

/// Whether a repeat counts Bikram Sambat months rather than AD ones.
fn repeats_in_bs(recurrence: &str) -> bool {
    matches!(recurrence, "monthlyBs" | "yearlyBs")
}

/// The day of the month a repeat keeps coming back to: the one it was set
/// for, or the date's own day for rows saved before that was stored.
fn anchor_day(
    ad: NaiveDate,
    bs: sajilo_core::NepaliDate,
    recurrence: &str,
    stored: Option<u32>,
) -> u32 {
    stored.unwrap_or_else(|| {
        if repeats_in_bs(recurrence) {
            bs.day
        } else {
            ad.day()
        }
    })
}

/// Moves a date forward one period, as when the tax is paid or the bill
/// settled. The day returns to `repeat_day` in each new month, clamped to that
/// month's length, so one short month (a 29-day Poush, a 28-day February)
/// never pulls every later date back with it.
fn advance_date(
    ad: NaiveDate,
    bs: sajilo_core::NepaliDate,
    recurrence: &str,
    repeat_day: Option<u32>,
) -> Result<(NaiveDate, sajilo_core::NepaliDate)> {
    let months = match recurrence {
        "monthly" | "monthlyBs" => 1,
        "quarterly" => 3,
        "halfYearly" => 6,
        "yearlyAd" | "yearlyBs" => 12,
        _ => return Err("This document doesn't repeat.".to_owned()),
    };
    let day = anchor_day(ad, bs, recurrence, repeat_day);
    if repeats_in_bs(recurrence) {
        let next = day_months_later(months, bs, day)
            .map_err(|_| "The next Bikram Sambat date is out of range.".to_owned())?;
        let next_ad = gregorian_date_from(next).map_err(|error| error.to_string())?;
        return Ok((next_ad, next));
    }
    let first = ad
        .with_day(1)
        .and_then(|first| first.checked_add_months(Months::new(months as u32)))
        .ok_or_else(|| "That date is out of range.".to_owned())?;
    let next = month_date(first.year(), first.month(), day);
    let next_bs = nepali_date_from(next).map_err(|error| error.to_string())?;
    Ok((next, next_bs))
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
    let due_date = output_opt_date(
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
        row.get(8)?,
    )
    .map_err(|_| rusqlite::Error::InvalidQuery)?;
    Ok(KeeperItem {
        id: row.get(0)?,
        person_id: row.get(1)?,
        title: row.get(2)?,
        category: row.get(3)?,
        status: row.get(9)?,
        due_date,
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
        template: row.get(21)?,
        repeat_day: row.get(22)?,
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
    let record = KeeperRecord {
        document_type: row.get(1)?,
        number: row.get(2)?,
        issued_date: issued,
        expiry_date: expiry,
        office: row.get(13)?,
        note: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
        details: parse_json(row.get(17)?)?,
        person_id: row.get(18)?,
        recurrence: row.get(19)?,
        remind_days: parse_json(row.get(20)?)?,
        links: parse_json(row.get(21)?)?,
        custom_fields: parse_json(row.get(22)?)?,
        repeat_day: row.get(23)?,
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
                office, note, created_at, updated_at, details,
                person_id, recurrence, remind_days, links, custom_fields, repeat_day
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
                application_status, checklist, created_at, updated_at, completed_at, template,
                repeat_day
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
    // Cheap, and the one moment Keeper is opened: tidy photos left behind by
    // a form that was closed without saving.
    let _ = crate::commands::attachments::prune_orphans(&app);
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

/// A record's free-form fields, tidied and encoded as their columns store
/// them: blank details and self-links dropped, remind days deduplicated.
fn stored_record_fields(record: &KeeperRecordInput) -> Result<(String, String, String, String)> {
    let details = record
        .details
        .iter()
        .map(|(key, value)| (key.as_str(), value.trim()))
        .filter(|(_, value)| !value.is_empty())
        .collect::<BTreeMap<_, _>>();
    let details = serde_json::to_string(&details).map_err(|error| error.to_string())?;
    let mut links = record
        .links
        .iter()
        .filter(|link| **link != record.id)
        .collect::<Vec<_>>();
    links.sort();
    links.dedup();
    let links = serde_json::to_string(&links).map_err(|error| error.to_string())?;
    let mut remind_days = record.remind_days.clone();
    remind_days.sort_unstable_by(|a, b| b.cmp(a));
    remind_days.dedup();
    let remind_days = serde_json::to_string(&remind_days).map_err(|error| error.to_string())?;
    // A field with neither label nor value is an empty row the user added
    // and never filled; don't keep it.
    let custom_fields = record
        .custom_fields
        .iter()
        .map(|field| KeeperField {
            label: field.label.trim().to_owned(),
            value: field.value.trim().to_owned(),
        })
        .filter(|field| !field.label.is_empty() || !field.value.is_empty())
        .collect::<Vec<_>>();
    let custom_fields = serde_json::to_string(&custom_fields).map_err(|error| error.to_string())?;
    Ok((details, links, remind_days, custom_fields))
}

/// The repeat day to store with a date being saved. Saving a date whose day
/// was clamped by a short month must not make the clamp permanent, so while
/// the date and the repeat's calendar are unchanged the stored day is kept;
/// a date the user picked anew, or a new calendar, starts from its own day.
fn kept_repeat_day(
    connection: &rusqlite::Connection,
    table: &str,
    date_column: &str,
    id: &str,
    date: Option<(NaiveDate, sajilo_core::NepaliDate)>,
    recurrence: &str,
) -> Result<Option<u32>> {
    let Some((ad, bs)) = date.filter(|_| recurrence != "none") else {
        return Ok(None);
    };
    let stored: Option<(Option<String>, String, Option<u32>)> = connection
        .query_row(
            &format!("SELECT {date_column}, recurrence, repeat_day FROM {table} WHERE id = ?1"),
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let kept = stored.and_then(|(stored_ad, stored_recurrence, day)| {
        (stored_ad.as_deref() == Some(ad.to_string().as_str())
            && repeats_in_bs(&stored_recurrence) == repeats_in_bs(recurrence))
        .then_some(day)
        .flatten()
    });
    Ok(Some(anchor_day(ad, bs, recurrence, kept)))
}

#[tauri::command]
pub fn save_keeper_item(app: AppHandle<Wry>, item: KeeperItem) -> Result<KeeperSnapshot> {
    if item.title.trim().is_empty() {
        return Err("Give this reminder a name first.".to_owned());
    }
    let due_input = item.due_date.as_ref().map(|date| KeeperDateInput {
        calendar: date.calendar.clone(),
        year: date.year,
        month: date.month,
        day: date.day,
    });
    let due = resolve_opt_date(due_input.as_ref())?;
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
    let repeat_day = kept_repeat_day(
        &connection,
        "keeper_items",
        "due_ad",
        &item.id,
        due,
        &item.recurrence,
    )?;
    connection.execute(
        "INSERT INTO keeper_items
          (id, person_id, title, category, status, due_calendar, due_ad,
           due_bs_year, due_bs_month, due_bs_day, recurrence, remind_days, note,
           official_url, office_location, fee, application_status, checklist,
           created_at, updated_at, completed_at, template, repeat_day)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)
         ON CONFLICT(id) DO UPDATE SET person_id=excluded.person_id, title=excluded.title,
           category=excluded.category, status=excluded.status, due_calendar=excluded.due_calendar,
           due_ad=excluded.due_ad, due_bs_year=excluded.due_bs_year, due_bs_month=excluded.due_bs_month,
           due_bs_day=excluded.due_bs_day, recurrence=excluded.recurrence, remind_days=excluded.remind_days,
           note=excluded.note, official_url=excluded.official_url, office_location=excluded.office_location,
           fee=excluded.fee, application_status=excluded.application_status, checklist=excluded.checklist,
           updated_at=excluded.updated_at, completed_at=excluded.completed_at,
           template=excluded.template, repeat_day=excluded.repeat_day",
        params![item.id, item.person_id, item.title.trim(), item.category, item.status,
            due_input.as_ref().map(|date| date.calendar.clone()), due.map(|(ad, _)| ad.to_string()),
            due.map(|(_, bs)| bs.year), due.map(|(_, bs)| bs.month), due.map(|(_, bs)| bs.day), item.recurrence, remind_days, item.note,
            item.official_url, item.office_location, item.fee, item.application_status, checklist,
            created, updated, completed_at, item.template, repeat_day],
    ).map_err(|error| error.to_string())?;
    keeper_snapshot(app)
}

#[tauri::command]
pub fn delete_keeper_item(app: AppHandle<Wry>, id: String) -> Result<KeeperSnapshot> {
    crate::commands::attachments::delete_for_owner(&app, "item", &id)?;
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
    if let Some(message) = missing_identity(&record) {
        return Err(message.to_owned());
    }
    if !RECORD_RECURRENCES.contains(&record.recurrence.as_str()) {
        return Err("That repeat interval isn't supported.".to_owned());
    }
    if record.recurrence != "none" && record.expiry_date.is_none() {
        return Err("Add the next due date first.".to_owned());
    }
    let (details, links, remind_days, custom_fields) = stored_record_fields(&record)?;
    let issued = resolve_opt_date(record.issued_date.as_ref())?;
    let expiry = resolve_opt_date(record.expiry_date.as_ref())?;
    let created = if record.created_at.is_empty() {
        now()
    } else {
        record.created_at.clone()
    };
    let updated = now();

    let connection = db::open(&app)?;
    let repeat_day = kept_repeat_day(
        &connection,
        "keeper_records",
        "expiry_ad",
        &record.id,
        expiry,
        &record.recurrence,
    )?;
    connection
        .execute(
            "INSERT INTO keeper_records
          (id, document_type, number, issued_calendar, issued_ad,
           issued_bs_year, issued_bs_month, issued_bs_day,
           expiry_calendar, expiry_ad, expiry_bs_year, expiry_bs_month, expiry_bs_day,
           office, note, created_at, updated_at, details,
           person_id, recurrence, remind_days, links, custom_fields, repeat_day)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
                 ?19, ?20, ?21, ?22, ?23, ?24)
         ON CONFLICT(id) DO UPDATE SET document_type=excluded.document_type, number=excluded.number,
           issued_calendar=excluded.issued_calendar, issued_ad=excluded.issued_ad,
           issued_bs_year=excluded.issued_bs_year, issued_bs_month=excluded.issued_bs_month,
           issued_bs_day=excluded.issued_bs_day, expiry_calendar=excluded.expiry_calendar,
           expiry_ad=excluded.expiry_ad, expiry_bs_year=excluded.expiry_bs_year,
           expiry_bs_month=excluded.expiry_bs_month, expiry_bs_day=excluded.expiry_bs_day,
           office=excluded.office, note=excluded.note, updated_at=excluded.updated_at,
           details=excluded.details, person_id=excluded.person_id,
           recurrence=excluded.recurrence, remind_days=excluded.remind_days, links=excluded.links,
           custom_fields=excluded.custom_fields, repeat_day=excluded.repeat_day",
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
                details,
                record.person_id,
                record.recurrence,
                remind_days,
                links,
                custom_fields,
                repeat_day,
            ],
        )
        .map_err(|error| error.to_string())?;
    keeper_snapshot(app)
}

/// Ticks a reminder off. A repeating one (a monthly bill) is not finished —
/// this cycle is — so its due date moves on one period and it stays active;
/// only a one-off reminder, or one with no date, becomes completed.
#[tauri::command]
pub fn complete_keeper_item(app: AppHandle<Wry>, id: String) -> Result<KeeperSnapshot> {
    let item = items(&app)?
        .into_iter()
        .find(|item| item.id == id)
        .ok_or_else(|| "That reminder no longer exists.".to_owned())?;
    let connection = db::open(&app)?;
    if let Some(due) = item.due_date.as_ref().filter(|_| item.recurrence != "none") {
        let bs = sajilo_core::NepaliDate::new(due.bs.year, due.bs.month, due.bs.day);
        let (ad, bs) = advance_date(parse_ad(&due.ad)?, bs, &item.recurrence, item.repeat_day)?;
        connection
            .execute(
                "UPDATE keeper_items SET due_ad = ?1, due_bs_year = ?2, due_bs_month = ?3,
                   due_bs_day = ?4, updated_at = ?5 WHERE id = ?6",
                params![ad.to_string(), bs.year, bs.month, bs.day, now(), id],
            )
            .map_err(|error| error.to_string())?;
    } else {
        let stamp = now();
        connection
            .execute(
                "UPDATE keeper_items SET status = 'completed', completed_at = ?1,
                   updated_at = ?1 WHERE id = ?2",
                params![stamp, id],
            )
            .map_err(|error| error.to_string())?;
    }
    keeper_snapshot(app)
}

/// Marks a repeating record's date as handled — tax paid, policy renewed,
/// premium paid — by moving it forward one period.
#[tauri::command]
pub fn advance_keeper_record(app: AppHandle<Wry>, id: String) -> Result<KeeperSnapshot> {
    let record = records(&app)?
        .into_iter()
        .find(|record| record.id == id)
        .ok_or_else(|| "That document no longer exists.".to_owned())?;
    let due = record
        .expiry_date
        .as_ref()
        .ok_or_else(|| "This document has no due date.".to_owned())?;
    let bs = sajilo_core::NepaliDate::new(due.bs.year, due.bs.month, due.bs.day);
    let (ad, bs) = advance_date(
        parse_ad(&due.ad)?,
        bs,
        &record.recurrence,
        record.repeat_day,
    )?;
    let connection = db::open(&app)?;
    connection
        .execute(
            "UPDATE keeper_records SET expiry_ad = ?1, expiry_bs_year = ?2, expiry_bs_month = ?3,
               expiry_bs_day = ?4, updated_at = ?5 WHERE id = ?6",
            params![ad.to_string(), bs.year, bs.month, bs.day, now(), id],
        )
        .map_err(|error| error.to_string())?;
    keeper_snapshot(app)
}

#[tauri::command]
pub fn delete_keeper_record(app: AppHandle<Wry>, id: String) -> Result<KeeperSnapshot> {
    crate::commands::attachments::delete_for_owner(&app, "record", &id)?;
    let connection = db::open(&app)?;
    // Links are stored one way, so drop this id from whichever records point
    // at it rather than leave a dangling reference.
    for other in records(&app)?
        .into_iter()
        .filter(|other| other.links.contains(&id))
    {
        let links = other
            .links
            .iter()
            .filter(|link| **link != id)
            .collect::<Vec<_>>();
        let links = serde_json::to_string(&links).map_err(|error| error.to_string())?;
        connection
            .execute(
                "UPDATE keeper_records SET links = ?1 WHERE id = ?2",
                params![links, other.id],
            )
            .map_err(|error| error.to_string())?;
    }
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

/// The first due date on or after `today`: the item's own date, then one
/// period after another. A bill left unpaid still reminds each cycle, and one
/// marked paid early (its date already moved on) never reminds for the cycle
/// it settled.
fn next_due(item: &KeeperItem, today: NaiveDate) -> Option<NaiveDate> {
    let due_date = item.due_date.as_ref()?;
    let mut ad = parse_ad(&due_date.ad).ok()?;
    if item.recurrence == "none" {
        return (ad >= today).then_some(ad);
    }
    let mut bs = sajilo_core::NepaliDate::new(due_date.bs.year, due_date.bs.month, due_date.bs.day);
    let repeat_day = Some(anchor_day(ad, bs, &item.recurrence, item.repeat_day));
    // Bounded: a monthly bill forgotten for years is not worth walking to.
    for _ in 0..240 {
        if ad >= today {
            return Some(ad);
        }
        (ad, bs) = advance_date(ad, bs, &item.recurrence, repeat_day).ok()?;
    }
    None
}

/// The day after the due date, one last nudge that it has passed.
const OVERDUE: i64 = -1;

/// Every notification one dated thing sends: one per chosen remind-before day
/// (0 is the day itself), plus an overdue one the day after. Each id carries
/// the due date, so a monthly bill's next cycle is a new notification rather
/// than one the scheduler remembers having delivered last month.
fn plan_due(
    key: &str,
    title: &str,
    person: &str,
    due: NaiveDate,
    remind_days: &[u32],
    now: chrono::DateTime<Utc>,
) -> Vec<PlannedNotification> {
    remind_days
        .iter()
        .map(|days| i64::from(*days))
        .chain(std::iter::once(OVERDUE))
        .filter_map(|days| {
            let naive = (due - Duration::days(days)).and_hms_opt(9, 0, 0)?;
            let fire_at = sajilo_core::nepal_time::offset()
                .from_local_datetime(&naive)
                .single()?
                .with_timezone(&Utc);
            sajilo_core::notify::still_deliverable(fire_at, now).then(|| PlannedNotification {
                id: format!("sajilo.keeper.{key}.{due}.{days}"),
                title: title.to_owned(),
                body: due_body(person, days),
                fire_at,
            })
        })
        .collect()
}

fn due_body(person: &str, days: i64) -> String {
    let when = match days {
        OVERDUE => "Overdue since yesterday".to_owned(),
        0 => "Due today".to_owned(),
        1 => "Due tomorrow".to_owned(),
        days => format!("Due in {days} days"),
    };
    if person.is_empty() {
        when
    } else {
        format!("{person} · {}", when.to_lowercase())
    }
}

pub fn pending_notifications(
    app: &AppHandle<Wry>,
    now: chrono::DateTime<Utc>,
) -> Vec<PlannedNotification> {
    let today = now
        .with_timezone(&sajilo_core::nepal_time::offset())
        .date_naive();
    // Still planning yesterday's due dates is what lets the overdue nudge go
    // out; anything older has nothing left that could be delivered.
    let yesterday = today - Duration::days(1);
    let names = people(app)
        .unwrap_or_default()
        .into_iter()
        .map(|person| (person.id, person.name))
        .collect::<std::collections::HashMap<_, _>>();
    let name_of = |id: &Option<String>| {
        id.as_deref()
            .and_then(|id| names.get(id))
            .map_or(String::new(), Clone::clone)
    };
    let mut result = Vec::new();
    for item in items(app)
        .unwrap_or_default()
        .into_iter()
        .filter(|item| item.status == "active")
    {
        if let Some(due) = next_due(&item, yesterday) {
            result.extend(plan_due(
                &item.id,
                &item.title,
                &name_of(&item.person_id),
                due,
                &item.remind_days,
                now,
            ));
        }
    }
    for record in records(app).unwrap_or_default() {
        let Some(due) = record
            .expiry_date
            .as_ref()
            .and_then(|date| parse_ad(&date.ad).ok())
            .filter(|due| *due >= yesterday)
        else {
            continue;
        };
        result.extend(plan_due(
            &format!("record.{}", record.id),
            &record_title(&record),
            &name_of(&record.person_id),
            due,
            &record.remind_days,
            now,
        ));
    }
    result.sort_by_key(|item| item.fire_at);
    result.truncate(LIMIT);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(document_type: &str, number: &str, details: &[(&str, &str)]) -> KeeperRecordInput {
        KeeperRecordInput {
            id: "r".to_owned(),
            document_type: document_type.to_owned(),
            person_id: None,
            number: number.to_owned(),
            issued_date: None,
            expiry_date: None,
            recurrence: "none".to_owned(),
            remind_days: Vec::new(),
            office: String::new(),
            note: String::new(),
            details: details
                .iter()
                .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
                .collect(),
            links: Vec::new(),
            custom_fields: Vec::new(),
            created_at: String::new(),
        }
    }

    fn record(document_type: &str, number: &str, details: &[(&str, &str)]) -> KeeperRecord {
        let input = input(document_type, number, details);
        KeeperRecord {
            id: input.id,
            document_type: input.document_type,
            person_id: None,
            number: input.number,
            issued_date: None,
            expiry_date: None,
            recurrence: input.recurrence,
            remind_days: Vec::new(),
            office: String::new(),
            note: String::new(),
            details: input.details,
            links: Vec::new(),
            custom_fields: Vec::new(),
            created_at: String::new(),
            updated_at: String::new(),
            repeat_day: None,
        }
    }

    #[test]
    fn warranty_is_identified_by_product_not_serial() {
        assert!(missing_identity(&input("warranty", "", &[("product", "Fridge")])).is_none());
        assert!(missing_identity(&input("warranty", "SN1", &[])).is_some());
        assert!(missing_identity(&input("bluebook", " ", &[])).is_some());
        assert!(missing_identity(&input("insurance", "P-1", &[])).is_none());
        // A custom document is known by the name the user gave it.
        assert!(missing_identity(&input("custom", "", &[("name", "Land ownership")])).is_none());
        assert!(missing_identity(&input("custom", "123", &[])).is_some());
    }

    #[test]
    fn record_titles_name_the_thing_that_is_due() {
        assert_eq!(
            record_title(&record("bluebook", "Ba 12 Pa 3456", &[])),
            "Bluebook tax · Ba 12 Pa 3456"
        );
        assert_eq!(
            record_title(&record("insurance", "P-1", &[("insurer", "Shikhar")])),
            "Insurance renewal · Shikhar"
        );
        assert_eq!(
            record_title(&record(
                "insurance",
                "P-1",
                &[("insurer", "Nepal Life"), ("insuranceType", "life")]
            )),
            "Insurance premium · Nepal Life"
        );
        assert_eq!(record_title(&record("warranty", "", &[])), "Warranty ends");
        assert_eq!(
            record_title(&record("custom", "", &[("name", "Gym membership")])),
            "Gym membership"
        );
    }

    #[test]
    fn advancing_steps_one_period() {
        let ad = NaiveDate::from_ymd_opt(2026, 1, 31).unwrap();
        let bs = nepali_date_from(ad).unwrap();
        assert_eq!(
            advance_date(ad, bs, "monthly", None).unwrap().0,
            NaiveDate::from_ymd_opt(2026, 2, 28).unwrap()
        );
        assert_eq!(
            advance_date(ad, bs, "quarterly", None).unwrap().0,
            NaiveDate::from_ymd_opt(2026, 4, 30).unwrap()
        );
        assert_eq!(
            advance_date(ad, bs, "yearlyAd", None).unwrap().0,
            NaiveDate::from_ymd_opt(2027, 1, 31).unwrap()
        );
        assert!(advance_date(ad, bs, "none", None).is_err());
    }

    #[test]
    fn bs_yearly_keeps_month_and_clamps_the_day() {
        // Ashad's length varies year to year; the last day must still land
        // on a real date in Ashad of the next year.
        let bs = sajilo_core::NepaliDate::new(2082, 3, 32);
        if let Ok(ad) = gregorian_date_from(bs) {
            let (_, next) = advance_date(ad, bs, "yearlyBs", None).unwrap();
            assert_eq!((next.year, next.month), (2083, 3));
            assert!(next.day >= 29);
        }
        let bs = sajilo_core::NepaliDate::new(2082, 3, 15);
        let ad = gregorian_date_from(bs).unwrap();
        let (_, next) = advance_date(ad, bs, "yearlyBs", None).unwrap();
        assert_eq!((next.year, next.month, next.day), (2083, 3, 15));
    }

    #[test]
    fn undated_items_never_come_due() {
        let item = KeeperItem {
            id: "i".to_owned(),
            person_id: None,
            title: "Citizenship certificate".to_owned(),
            category: "identity".to_owned(),
            status: "active".to_owned(),
            due_date: None,
            recurrence: "none".to_owned(),
            remind_days: vec![7],
            note: String::new(),
            official_url: String::new(),
            office_location: String::new(),
            fee: String::new(),
            application_status: "notStarted".to_owned(),
            checklist: Vec::new(),
            created_at: String::new(),
            updated_at: String::new(),
            completed_at: None,
            template: None,
            repeat_day: None,
        };
        let today = NaiveDate::from_ymd_opt(2026, 9, 16).unwrap();
        assert_eq!(next_due(&item, today), None);
    }

    /// An AD monthly bill on the 31st lands on February's last day, then goes
    /// back to the 31st rather than staying on the 28th for good.
    #[test]
    fn ad_monthly_returns_to_its_day_after_a_short_month() {
        let ad = NaiveDate::from_ymd_opt(2026, 1, 31).unwrap();
        let bs = nepali_date_from(ad).unwrap();
        let (feb, feb_bs) = advance_date(ad, bs, "monthly", Some(31)).unwrap();
        assert_eq!(feb, NaiveDate::from_ymd_opt(2026, 2, 28).unwrap());
        let (march, _) = advance_date(feb, feb_bs, "monthly", Some(31)).unwrap();
        assert_eq!(march, NaiveDate::from_ymd_opt(2026, 3, 31).unwrap());
    }

    /// A BS monthly bill counts Nepali months: the 30th stays the 30th, not
    /// whatever AD day the 30th first fell on.
    #[test]
    fn bs_monthly_steps_bikram_sambat_months_and_keeps_its_day() {
        use sajilo_core::calendar::bikram_sambat::days_in_month;

        let mut bs = sajilo_core::NepaliDate::new(2083, 1, 30);
        let mut ad = gregorian_date_from(bs).unwrap();
        let mut clamped = false;
        for _ in 0..24 {
            (ad, bs) = advance_date(ad, bs, "monthlyBs", Some(30)).unwrap();
            assert_eq!(nepali_date_from(ad).unwrap(), bs, "AD and BS agree");
            let length = days_in_month(bs.year, bs.month).unwrap() as u32;
            assert_eq!(bs.day, length.min(30), "the 30th, or the month's last day");
            clamped |= length < 30;
        }
        assert!(clamped, "the walk passes a 29-day month and recovers");
    }

    fn dated_item(bs: sajilo_core::NepaliDate, recurrence: &str) -> KeeperItem {
        let ad = gregorian_date_from(bs).unwrap();
        KeeperItem {
            id: "i".to_owned(),
            person_id: None,
            title: "Rent".to_owned(),
            category: "home".to_owned(),
            status: "active".to_owned(),
            due_date: Some(output_date("bs", ad, bs)),
            recurrence: recurrence.to_owned(),
            remind_days: vec![0],
            note: String::new(),
            official_url: String::new(),
            office_location: String::new(),
            fee: String::new(),
            application_status: String::new(),
            checklist: Vec::new(),
            created_at: String::new(),
            updated_at: String::new(),
            completed_at: None,
            template: None,
            repeat_day: None,
        }
    }

    /// An unpaid BS monthly bill still comes due next Nepali month, on its
    /// Nepali day.
    #[test]
    fn an_unpaid_bs_monthly_item_comes_due_next_bs_month() {
        let item = dated_item(sajilo_core::NepaliDate::new(2083, 4, 1), "monthlyBs");
        // BS 2083-05-16: Bhadra 1 has passed, Asoj 1 is next.
        let today = NaiveDate::from_ymd_opt(2026, 9, 1).unwrap();
        let due = next_due(&item, today).unwrap();
        assert_eq!(
            nepali_date_from(due).unwrap(),
            sajilo_core::NepaliDate::new(2083, 6, 1)
        );
    }

    /// A first due date still ahead is the next one; a repeat never reminds
    /// for a cycle before it.
    #[test]
    fn a_repeat_starts_at_its_own_date() {
        let item = dated_item(sajilo_core::NepaliDate::new(2083, 9, 10), "monthlyBs");
        let today = NaiveDate::from_ymd_opt(2026, 9, 1).unwrap();
        assert_eq!(
            nepali_date_from(next_due(&item, today).unwrap()).unwrap(),
            sajilo_core::NepaliDate::new(2083, 9, 10)
        );
    }

    #[test]
    fn a_due_date_notifies_ahead_on_the_day_and_once_overdue() {
        let due = NaiveDate::from_ymd_opt(2026, 10, 10).unwrap();
        // 8 days out at 10am Nepal time: 7d, 1d, on the day, and overdue are
        // all still ahead.
        let now = sajilo_core::nepal_time::offset()
            .from_local_datetime(
                &NaiveDate::from_ymd_opt(2026, 10, 2)
                    .unwrap()
                    .and_hms_opt(10, 0, 0)
                    .unwrap(),
            )
            .unwrap()
            .with_timezone(&Utc);
        let planned = plan_due("i", "Rent", "Aama", due, &[7, 1, 0], now);
        let bodies = planned.iter().map(|n| n.body.as_str()).collect::<Vec<_>>();
        assert_eq!(
            bodies,
            [
                "Aama · due in 7 days",
                "Aama · due tomorrow",
                "Aama · due today",
                "Aama · overdue since yesterday"
            ]
        );
        assert!(planned.iter().all(|n| n.id.contains("2026-10-10")));
    }

    #[test]
    fn next_months_bill_is_a_different_notification() {
        let now = Utc::now();
        let this = plan_due(
            "i",
            "Rent",
            "",
            now.date_naive() + Duration::days(3),
            &[0],
            now,
        );
        let next = plan_due(
            "i",
            "Rent",
            "",
            now.date_naive() + Duration::days(33),
            &[0],
            now,
        );
        assert_ne!(this[0].id, next[0].id);
    }
}
