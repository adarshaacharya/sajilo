//! The Notes tab's commands. Storage and its rules live in `crate::notes`;
//! these open the database, supply the time, Nepal's date and the language,
//! and hand the result to the page.

use std::sync::atomic::{AtomicBool, Ordering};

use chrono::{Timelike, Utc};
use sajilo_api::notes::{NoteDocument, NoteSaved, NoteSearchHit, NoteTrashed, NotesList};
use sajilo_core::NepaliDate;
use sajilo_core::calendar::bikram_sambat::nepali_date_from;
use tauri::{AppHandle, Wry};

use crate::db;
use crate::notes::{self, Clock, Result};

/// Set once the Notes tables are seeded and the Trash emptied this run.
static READY: AtomicBool = AtomicBool::new(false);

fn connection(app: &AppHandle<Wry>) -> Result<rusqlite::Connection> {
    let mut connection = db::open(app)?;
    if !READY.load(Ordering::SeqCst) {
        let now = Utc::now();
        notes::ensure_ready(&mut connection, crate::prefs::language(app), now)?;
        notes::purge_trash(&mut connection, now)?;
        READY.store(true, Ordering::SeqCst);
    }
    Ok(connection)
}

fn clock(app: &AppHandle<Wry>) -> Clock {
    Clock {
        now: Utc::now(),
        today: sajilo_core::nepal_time::today(),
        language: crate::prefs::language(app),
    }
}

fn today_bs() -> Result<NepaliDate> {
    nepali_date_from(sajilo_core::nepal_time::today()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn notes_list(app: AppHandle<Wry>) -> Result<NotesList> {
    notes::list(&connection(&app)?, &clock(&app))
}

#[tauri::command]
pub fn notes_open(app: AppHandle<Wry>, id: String) -> Result<NoteDocument> {
    notes::open_note(&connection(&app)?, &id, Utc::now())
}

#[tauri::command]
pub fn notes_save(
    app: AppHandle<Wry>,
    id: String,
    body: String,
    revision: u32,
) -> Result<NoteSaved> {
    notes::save_note(&mut connection(&app)?, &id, &body, revision, Utc::now())
}

#[tauri::command]
pub fn notes_remember_cursor(app: AppHandle<Wry>, id: String, cursor: u32) -> Result<()> {
    notes::remember_cursor(&connection(&app)?, &id, cursor)
}

#[tauri::command]
pub fn notes_create(
    app: AppHandle<Wry>,
    folder_id: String,
    body: Option<String>,
) -> Result<String> {
    notes::create_note(
        &mut connection(&app)?,
        &folder_id,
        body.as_deref().unwrap_or(""),
        Utc::now(),
    )
}

#[tauri::command]
pub fn notes_move(app: AppHandle<Wry>, id: String, folder_id: String) -> Result<()> {
    notes::move_note(&mut connection(&app)?, &id, &folder_id, Utc::now())
}

#[tauri::command]
pub fn notes_pin(app: AppHandle<Wry>, id: String, pinned: bool) -> Result<()> {
    notes::pin_note(&connection(&app)?, &id, pinned, Utc::now())
}

#[tauri::command]
pub fn notes_trash(app: AppHandle<Wry>, id: String) -> Result<()> {
    notes::trash_note(&connection(&app)?, &id, Utc::now())
}

#[tauri::command]
pub fn notes_restore(app: AppHandle<Wry>, id: String) -> Result<()> {
    notes::restore_note(&mut connection(&app)?, &id, Utc::now())
}

/// Today's note's id, made if it isn't there yet.
#[tauri::command]
pub fn notes_today(app: AppHandle<Wry>) -> Result<String> {
    let language = crate::prefs::language(&app);
    notes::daily_note(&mut connection(&app)?, today_bs()?, language, Utc::now())
}

/// Adds a line to today's note, under the time.
#[tauri::command]
pub fn notes_jot(app: AppHandle<Wry>, text: String) -> Result<String> {
    let now = sajilo_core::nepal_time::now();
    let minutes = now.hour() * 60 + now.minute();
    let language = crate::prefs::language(&app);
    notes::jot(
        &mut connection(&app)?,
        &text,
        today_bs()?,
        minutes,
        language,
        Utc::now(),
    )
}

#[tauri::command]
pub fn notes_search(
    app: AppHandle<Wry>,
    query: String,
    folder_id: Option<String>,
) -> Result<Vec<NoteSearchHit>> {
    let query = sajilo_core::limits::clip(&query, sajilo_core::limits::SEARCH);
    notes::search(&connection(&app)?, &query, folder_id.as_deref())
}

/// The note as plain text, for pasting into a message.
#[tauri::command]
pub fn notes_as_text(app: AppHandle<Wry>, id: String) -> Result<String> {
    notes::note_as_text(&connection(&app)?, &id)
}

/// Takes the ticked checklist items out of a note.
#[tauri::command]
pub fn notes_remove_ticked(app: AppHandle<Wry>, id: String, revision: u32) -> Result<NoteSaved> {
    let mut connection = connection(&app)?;
    let body = notes::open_note(&connection, &id, Utc::now())?.body;
    let cleaned = sajilo_core::notes::remove_ticked(&body);
    notes::save_note(&mut connection, &id, &cleaned, revision, Utc::now())
}

#[tauri::command]
pub fn notes_create_folder(app: AppHandle<Wry>, name: String) -> Result<String> {
    notes::create_folder(&mut connection(&app)?, &name, Utc::now())
}

#[tauri::command]
pub fn notes_rename_folder(app: AppHandle<Wry>, id: String, name: String) -> Result<()> {
    notes::rename_folder(&connection(&app)?, &id, &name, Utc::now())
}

#[tauri::command]
pub fn notes_delete_folder(app: AppHandle<Wry>, id: String) -> Result<()> {
    notes::delete_folder(&connection(&app)?, &id, Utc::now())
}

/// Romanized Nepali to Devanagari: `mero naam` → `मेरो नाम`. With `finished`
/// false only the words already ended are turned.
#[tauri::command]
pub fn notes_transliterate(text: String, finished: bool) -> String {
    sajilo_core::notes::nepali::transliterate(&text, finished)
}

#[tauri::command]
pub fn notes_trash_list(app: AppHandle<Wry>) -> Result<Vec<NoteTrashed>> {
    notes::trash(&connection(&app)?, Utc::now())
}

/// Deletes one note in the Trash for good, or empties it with no id.
#[tauri::command]
pub fn notes_delete_forever(app: AppHandle<Wry>, id: Option<String>) -> Result<()> {
    notes::delete_forever(&mut connection(&app)?, id.as_deref())
}
