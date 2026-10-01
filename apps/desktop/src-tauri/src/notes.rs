//! Notes storage: every read and write of the notes tables, each change in
//! one transaction.
//!
//! The note's Markdown body is the one source of truth. Everything else
//! stored beside it (title, preview, counts, tags, links, the search index) is
//! derived from the body on each save, by `sajilo_core::notes`, so it can
//! always be rebuilt and never disagrees with the text. The schema and why
//! it is shaped so: `db::NOTES_TABLES`.
//!
//! Functions take a `Connection` rather than the app, so the tests run on an
//! in-memory database with the real schema.

use chrono::{DateTime, Duration, NaiveDate, SecondsFormat, Utc};
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use sajilo_api::notes::{
    NoteBacklink, NoteDocument, NoteFolder, NoteSaved, NoteSearchHit, NoteSummary, NoteTextPart,
    NoteTrashed, NotesList,
};
use sajilo_core::focus::Language;
use sajilo_core::notes::{self as core, key};
use sajilo_core::{NepaliDate, limits};

pub type Result<T> = std::result::Result<T, String>;

/// How long a trashed note is kept before it's gone for good.
const TRASH_DAYS: i64 = 30;
/// A note keeps a version from before an edit at most this often, and this
/// many in all.
const REVISION_EVERY_MINUTES: i64 = 10;
const REVISIONS_KEPT: i64 = 50;
/// Search results, at most.
const SEARCH_LIMIT: i64 = 30;

/// What "now" means for the list's headings: the time, Nepal's today, and the
/// language the headings are written in.
pub struct Clock {
    pub now: DateTime<Utc>,
    pub today: NaiveDate,
    pub language: Language,
}

fn stamp(time: DateTime<Utc>) -> String {
    time.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn sql(error: rusqlite::Error) -> String {
    error.to_string()
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Sets Notes up the first time: the Daily, Office and Personal folders and a
/// welcome note. Afterwards only makes sure the Daily folder is there, since
/// the day's note needs it; folders the user deleted stay deleted.
pub fn ensure_ready(
    connection: &mut Connection,
    language: Language,
    now: DateTime<Utc>,
) -> Result<()> {
    let tx = connection.transaction().map_err(sql)?;
    let seeded: Option<i64> = tx
        .query_row(
            "SELECT value FROM schema_meta WHERE key = 'notes_seeded'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(sql)?;
    daily_folder(&tx, now)?;
    if seeded.is_none() {
        let mut personal = String::new();
        for (position, name) in core::DEFAULT_FOLDERS.iter().enumerate() {
            let id = insert_folder(
                &tx,
                name,
                "user",
                i64::try_from(position).unwrap_or(0) + 1,
                now,
            )?;
            if *name == "Personal" {
                personal = id;
            }
        }
        let welcome = core::welcome_note(language);
        insert_note(&tx, &personal, welcome, None, now)?;
        tx.execute(
            "INSERT INTO schema_meta (key, value) VALUES ('notes_seeded', 1)",
            [],
        )
        .map_err(sql)?;
    }
    tx.commit().map_err(sql)
}

/// The Daily folder's id, made if it's missing.
fn daily_folder(tx: &Transaction, now: DateTime<Utc>) -> Result<String> {
    let existing: Option<String> = tx
        .query_row(
            "SELECT id FROM note_folders WHERE role = 'daily' AND deleted_at IS NULL",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(sql)?;
    existing.map_or_else(
        || insert_folder(tx, core::DAILY_FOLDER, "daily", 0, now),
        Ok,
    )
}

fn insert_folder(
    tx: &Transaction,
    name: &str,
    role: &str,
    position: i64,
    now: DateTime<Utc>,
) -> Result<String> {
    let name = folder_name(name)?;
    let id = new_id();
    tx.execute(
        "INSERT INTO note_folders (id, name, name_key, role, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![id, name, key(&name), role, position, stamp(now)],
    )
    .map_err(folder_error)?;
    Ok(id)
}

/// A folder name as kept: trimmed, NFC, within the limit, not empty.
fn folder_name(name: &str) -> Result<String> {
    let name = limits::clip(&core::normalized(name), limits::FOLDER);
    if name.is_empty() {
        return Err("A folder needs a name.".to_owned());
    }
    Ok(name)
}

fn folder_error(error: rusqlite::Error) -> String {
    if error.to_string().contains("UNIQUE") {
        "There's already a folder with that name.".to_owned()
    } else {
        error.to_string()
    }
}

// ------------------------------------------------------------------ folders

pub fn create_folder(
    connection: &mut Connection,
    name: &str,
    now: DateTime<Utc>,
) -> Result<String> {
    let tx = connection.transaction().map_err(sql)?;
    let position: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(position), 0) + 1 FROM note_folders WHERE deleted_at IS NULL",
            [],
            |row| row.get(0),
        )
        .map_err(sql)?;
    let id = insert_folder(&tx, name, "user", position, now)?;
    tx.commit().map_err(sql)?;
    Ok(id)
}

pub fn rename_folder(
    connection: &Connection,
    id: &str,
    name: &str,
    now: DateTime<Utc>,
) -> Result<()> {
    let name = folder_name(name)?;
    let changed = connection
        .execute(
            "UPDATE note_folders SET name = ?2, name_key = ?3, updated_at = ?4
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, name, key(&name), stamp(now)],
        )
        .map_err(folder_error)?;
    if changed == 0 {
        return Err("That folder no longer exists.".to_owned());
    }
    Ok(())
}

/// Deletes an empty folder. One with notes in it is refused, so a click can
/// never throw notes away; the Daily folder can't be deleted.
pub fn delete_folder(connection: &Connection, id: &str, now: DateTime<Utc>) -> Result<()> {
    let (role, notes): (String, i64) = connection
        .query_row(
            "SELECT f.role, (SELECT COUNT(*) FROM notes n WHERE n.folder_id = f.id AND n.deleted_at IS NULL)
             FROM note_folders f WHERE f.id = ?1 AND f.deleted_at IS NULL",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(sql)?
        .ok_or("That folder no longer exists.")?;
    if role == "daily" {
        return Err("The Daily folder holds each day's note and stays.".to_owned());
    }
    if notes > 0 {
        return Err("Move or delete the notes in this folder first.".to_owned());
    }
    connection
        .execute(
            "UPDATE note_folders SET deleted_at = ?2 WHERE id = ?1",
            params![id, stamp(now)],
        )
        .map_err(sql)?;
    Ok(())
}

// -------------------------------------------------------------------- notes

/// Adds a note. The body is stored as given (cut to the limit, NFC); title
/// and the rest are read from it.
fn insert_note(
    tx: &Transaction,
    folder_id: &str,
    body: &str,
    daily_bs: Option<&str>,
    now: DateTime<Utc>,
) -> Result<String> {
    let id = new_id();
    let body = clean_body(body);
    tx.execute(
        "INSERT INTO notes (id, folder_id, body, title, title_key, preview, daily_bs, created_at, updated_at)
         VALUES (?1, ?2, ?3, '', '', '', ?4, ?5, ?5)",
        params![id, folder_id, body, daily_bs, stamp(now)],
    )
    .map_err(sql)?;
    derive(tx, &id, &body)?;
    Ok(id)
}

fn clean_body(body: &str) -> String {
    core::normalized(body)
        .chars()
        .take(limits::NOTE_BODY)
        .collect()
}

/// Rewrites everything kept about a note from its body: title, preview,
/// counts, tags, links and its search entry.
fn derive(tx: &Transaction, id: &str, body: &str) -> Result<()> {
    let facts = core::facts(body);
    tx.execute(
        "UPDATE notes SET title = ?2, title_key = ?3, preview = ?4, word_count = ?5,
             open_tasks = ?6, done_tasks = ?7
         WHERE id = ?1",
        params![
            id,
            facts.title,
            key(&facts.title),
            facts.preview,
            facts.words,
            facts.open_tasks,
            facts.done_tasks
        ],
    )
    .map_err(sql)?;

    tx.execute("DELETE FROM note_tag_links WHERE note_id = ?1", [id])
        .map_err(sql)?;
    for tag in &facts.tags {
        tx.execute(
            "INSERT INTO note_tags (name, name_key, created_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(name_key) DO NOTHING",
            params![tag, key(tag), stamp(Utc::now())],
        )
        .map_err(sql)?;
        tx.execute(
            "INSERT OR IGNORE INTO note_tag_links (note_id, tag_id)
             SELECT ?1, id FROM note_tags WHERE name_key = ?2",
            params![id, key(tag)],
        )
        .map_err(sql)?;
    }
    tx.execute(
        "DELETE FROM note_tags WHERE id NOT IN (SELECT tag_id FROM note_tag_links)",
        [],
    )
    .map_err(sql)?;

    tx.execute("DELETE FROM note_links WHERE from_id = ?1", [id])
        .map_err(sql)?;
    for link in &facts.links {
        tx.execute(
            "INSERT OR IGNORE INTO note_links (from_id, target, target_key) VALUES (?1, ?2, ?3)",
            params![id, link, key(link)],
        )
        .map_err(sql)?;
    }

    tx.execute("DELETE FROM note_search WHERE note_id = ?1", [id])
        .map_err(sql)?;
    tx.execute(
        "INSERT INTO note_search (note_id, title, body, tags) VALUES (?1, ?2, ?3, ?4)",
        params![id, facts.title, body, facts.tags.join(" ")],
    )
    .map_err(sql)?;
    Ok(())
}

/// A new note in `folder_id`, with `body` (often empty).
pub fn create_note(
    connection: &mut Connection,
    folder_id: &str,
    body: &str,
    now: DateTime<Utc>,
) -> Result<String> {
    let tx = connection.transaction().map_err(sql)?;
    live_folder(&tx, folder_id)?;
    let id = insert_note(&tx, folder_id, body, None, now)?;
    tx.commit().map_err(sql)?;
    Ok(id)
}

fn live_folder(tx: &Transaction, folder_id: &str) -> Result<()> {
    let found: Option<i64> = tx
        .query_row(
            "SELECT 1 FROM note_folders WHERE id = ?1 AND deleted_at IS NULL",
            [folder_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(sql)?;
    found
        .map(|_| ())
        .ok_or_else(|| "That folder no longer exists.".to_owned())
}

/// Saves an edit. `revision` is the one the edit started from: if the note
/// has moved on since (saved from elsewhere), the save is refused rather than
/// overwriting newer text. Keeps the text from before the edit as a version,
/// at most every few minutes.
pub fn save_note(
    connection: &mut Connection,
    id: &str,
    body: &str,
    revision: u32,
    now: DateTime<Utc>,
) -> Result<NoteSaved> {
    let tx = connection.transaction().map_err(sql)?;
    let (current, old_body): (u32, String) = tx
        .query_row(
            "SELECT revision, body FROM notes WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(sql)?
        .ok_or("This note was deleted.")?;
    if current != revision {
        return Err(
            "This note changed since you opened it. Reopen it to see the latest.".to_owned(),
        );
    }
    let body = clean_body(body);
    if body == old_body {
        tx.commit().map_err(sql)?;
        return saved(connection, id);
    }
    keep_revision(&tx, id, &old_body, now)?;
    tx.execute(
        "UPDATE notes SET body = ?2, updated_at = ?3, revision = revision + 1 WHERE id = ?1",
        params![id, body, stamp(now)],
    )
    .map_err(sql)?;
    derive(&tx, id, &body)?;
    tx.commit().map_err(sql)?;
    saved(connection, id)
}

fn saved(connection: &Connection, id: &str) -> Result<NoteSaved> {
    connection
        .query_row(
            "SELECT revision, title FROM notes WHERE id = ?1",
            [id],
            |row| {
                Ok(NoteSaved {
                    id: id.to_owned(),
                    revision: row.get(0)?,
                    title: row.get(1)?,
                })
            },
        )
        .map_err(sql)
}

fn keep_revision(tx: &Transaction, id: &str, old_body: &str, now: DateTime<Utc>) -> Result<()> {
    if old_body.trim().is_empty() {
        return Ok(());
    }
    let last: Option<String> = tx
        .query_row(
            "SELECT MAX(created_at) FROM note_revisions WHERE note_id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(sql)?;
    let due = last
        .and_then(|last| DateTime::parse_from_rfc3339(&last).ok())
        .is_none_or(|last| {
            now.signed_duration_since(last) >= Duration::minutes(REVISION_EVERY_MINUTES)
        });
    if !due {
        return Ok(());
    }
    tx.execute(
        "INSERT INTO note_revisions (note_id, body, created_at) VALUES (?1, ?2, ?3)",
        params![id, old_body, stamp(now)],
    )
    .map_err(sql)?;
    tx.execute(
        "DELETE FROM note_revisions WHERE note_id = ?1 AND id NOT IN
           (SELECT id FROM note_revisions WHERE note_id = ?1 ORDER BY created_at DESC LIMIT ?2)",
        params![id, REVISIONS_KEPT],
    )
    .map_err(sql)?;
    Ok(())
}

/// One note to edit, remembered as the one last opened.
pub fn open_note(connection: &Connection, id: &str, now: DateTime<Utc>) -> Result<NoteDocument> {
    let (folder_id, body, revision, cursor, title_key): (String, String, u32, Option<u32>, String) =
        connection
            .query_row(
                "SELECT folder_id, body, revision, cursor, title_key FROM notes
             WHERE id = ?1 AND deleted_at IS NULL",
                [id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .optional()
            .map_err(sql)?
            .ok_or("This note was deleted.")?;
    connection
        .execute(
            "UPDATE notes SET opened_at = ?2 WHERE id = ?1",
            params![id, stamp(now)],
        )
        .map_err(sql)?;
    Ok(NoteDocument {
        id: id.to_owned(),
        folder_id,
        body,
        revision,
        cursor,
        linked_from: backlinks(connection, id, &title_key)?,
    })
}

fn backlinks(connection: &Connection, id: &str, title_key: &str) -> Result<Vec<NoteBacklink>> {
    if title_key.is_empty() {
        return Ok(Vec::new());
    }
    let mut statement = connection
        .prepare(
            "SELECT n.id, n.title, n.body FROM note_links l JOIN notes n ON n.id = l.from_id
             WHERE l.target_key = ?1 AND n.id <> ?2 AND n.deleted_at IS NULL
             ORDER BY n.updated_at DESC",
        )
        .map_err(sql)?;
    let rows = statement
        .query_map(params![title_key, id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(sql)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(sql)?;
    Ok(rows
        .into_iter()
        .map(|(id, title, body)| NoteBacklink {
            line: core::linking_line(&body, title_key).unwrap_or_default(),
            id,
            title,
        })
        .collect())
}

/// Where the cursor was, to put it back next time.
pub fn remember_cursor(connection: &Connection, id: &str, cursor: u32) -> Result<()> {
    connection
        .execute(
            "UPDATE notes SET cursor = ?2 WHERE id = ?1",
            params![id, cursor],
        )
        .map_err(sql)?;
    Ok(())
}

pub fn move_note(
    connection: &mut Connection,
    id: &str,
    folder_id: &str,
    now: DateTime<Utc>,
) -> Result<()> {
    let tx = connection.transaction().map_err(sql)?;
    live_folder(&tx, folder_id)?;
    tx.execute(
        "UPDATE notes SET folder_id = ?2, updated_at = ?3 WHERE id = ?1 AND deleted_at IS NULL",
        params![id, folder_id, stamp(now)],
    )
    .map_err(sql)?;
    tx.commit().map_err(sql)
}

pub fn pin_note(connection: &Connection, id: &str, pinned: bool, now: DateTime<Utc>) -> Result<()> {
    connection
        .execute(
            "UPDATE notes SET pinned_at = ?2 WHERE id = ?1",
            params![id, pinned.then(|| stamp(now))],
        )
        .map_err(sql)?;
    Ok(())
}

/// To the Trash, where it stays [`TRASH_DAYS`] days and can be put back.
pub fn trash_note(connection: &Connection, id: &str, now: DateTime<Utc>) -> Result<()> {
    connection
        .execute(
            "UPDATE notes SET deleted_at = ?2, pinned_at = NULL WHERE id = ?1",
            params![id, stamp(now)],
        )
        .map_err(sql)?;
    Ok(())
}

/// Back from the Trash. If its folder was deleted meanwhile, it goes to the
/// first folder there is.
pub fn restore_note(connection: &mut Connection, id: &str, now: DateTime<Utc>) -> Result<()> {
    let tx = connection.transaction().map_err(sql)?;
    let folder_live: bool = tx
        .query_row(
            "SELECT f.deleted_at IS NULL FROM notes n JOIN note_folders f ON f.id = n.folder_id WHERE n.id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(sql)?;
    if !folder_live {
        let fallback: String = tx
            .query_row(
                "SELECT id FROM note_folders WHERE deleted_at IS NULL AND role = 'user'
                 ORDER BY position LIMIT 1",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(sql)?
            .map_or_else(|| daily_folder(&tx, now), Ok)?;
        tx.execute(
            "UPDATE notes SET folder_id = ?2 WHERE id = ?1",
            params![id, fallback],
        )
        .map_err(sql)?;
    }
    tx.execute("UPDATE notes SET deleted_at = NULL WHERE id = ?1", [id])
        .map_err(sql)?;
    tx.commit().map_err(sql)
}

/// What's in the Trash, most recently deleted first, with the days each has
/// left.
pub fn trash(connection: &Connection, now: DateTime<Utc>) -> Result<Vec<NoteTrashed>> {
    let mut statement = connection
        .prepare(
            "SELECT id, title, preview, deleted_at FROM notes
             WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
        )
        .map_err(sql)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(sql)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(sql)?;
    Ok(rows
        .into_iter()
        .map(|(id, title, preview, deleted_at)| {
            let gone = DateTime::parse_from_rfc3339(&deleted_at).map_or(now, |at| {
                at.with_timezone(&Utc) + Duration::days(TRASH_DAYS)
            });
            // Rounded up: a note with a few hours left still has "1 day".
            let hours = gone.signed_duration_since(now).num_hours().max(0);
            let days_left = u32::try_from((hours + 23) / 24).unwrap_or(0);
            NoteTrashed {
                id,
                title,
                preview,
                deleted_at,
                days_left,
            }
        })
        .collect())
}

/// Deletes notes from the Trash for good: one, or every one with `None`.
/// Only ever a note already in the Trash.
pub fn delete_forever(connection: &mut Connection, id: Option<&str>) -> Result<()> {
    let tx = connection.transaction().map_err(sql)?;
    tx.execute(
        "DELETE FROM note_search WHERE note_id IN
           (SELECT id FROM notes WHERE deleted_at IS NOT NULL AND (?1 IS NULL OR id = ?1))",
        [id],
    )
    .map_err(sql)?;
    tx.execute(
        "DELETE FROM notes WHERE deleted_at IS NOT NULL AND (?1 IS NULL OR id = ?1)",
        [id],
    )
    .map_err(sql)?;
    tx.execute(
        "DELETE FROM note_tags WHERE id NOT IN (SELECT tag_id FROM note_tag_links)",
        [],
    )
    .map_err(sql)?;
    tx.commit().map_err(sql)
}

/// Empties the Trash of notes kept past [`TRASH_DAYS`].
pub fn purge_trash(connection: &mut Connection, now: DateTime<Utc>) -> Result<()> {
    let cutoff = stamp(now - Duration::days(TRASH_DAYS));
    let tx = connection.transaction().map_err(sql)?;
    tx.execute(
        "DELETE FROM note_search WHERE note_id IN
           (SELECT id FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?1)",
        [&cutoff],
    )
    .map_err(sql)?;
    tx.execute(
        "DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?1",
        [&cutoff],
    )
    .map_err(sql)?;
    tx.execute(
        "DELETE FROM note_tags WHERE id NOT IN (SELECT tag_id FROM note_tag_links)",
        [],
    )
    .map_err(sql)?;
    tx.commit().map_err(sql)
}

/// The note as plain text for a message.
pub fn note_as_text(connection: &Connection, id: &str) -> Result<String> {
    let body: String = connection
        .query_row("SELECT body FROM notes WHERE id = ?1", [id], |row| {
            row.get(0)
        })
        .map_err(sql)?;
    Ok(core::plain_text(&body))
}

// -------------------------------------------------------------- daily notes

/// Today's note's id, made (in the Daily folder, titled with the date) if
/// there isn't one yet. One trashed today is brought back rather than a
/// second made beside it.
pub fn daily_note(
    connection: &mut Connection,
    date: NepaliDate,
    language: Language,
    now: DateTime<Utc>,
) -> Result<String> {
    let tx = connection.transaction().map_err(sql)?;
    let id = daily_note_in(&tx, date, language, now)?;
    tx.commit().map_err(sql)?;
    Ok(id)
}

fn daily_note_in(
    tx: &Transaction,
    date: NepaliDate,
    language: Language,
    now: DateTime<Utc>,
) -> Result<String> {
    let day = core::daily_stem(date);
    let existing: Option<(String, bool)> = tx
        .query_row(
            "SELECT id, deleted_at IS NOT NULL FROM notes WHERE daily_bs = ?1",
            [&day],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(sql)?;
    if let Some((id, trashed)) = existing {
        if trashed {
            let folder = daily_folder(tx, now)?;
            tx.execute(
                "UPDATE notes SET deleted_at = NULL, folder_id = ?2 WHERE id = ?1",
                params![id, folder],
            )
            .map_err(sql)?;
        }
        return Ok(id);
    }
    let folder = daily_folder(tx, now)?;
    let body = format!("# {}\n", core::daily_title(date, language));
    insert_note(tx, &folder, &body, Some(&day), now)
}

/// Adds a jot to today's note under a time heading; returns the note's id.
pub fn jot(
    connection: &mut Connection,
    text: &str,
    date: NepaliDate,
    minutes: u32,
    language: Language,
    now: DateTime<Utc>,
) -> Result<String> {
    let text = limits::clip(&core::normalized(text), limits::NOTE);
    if text.is_empty() {
        return Err("Nothing to add.".to_owned());
    }
    let tx = connection.transaction().map_err(sql)?;
    let id = daily_note_in(&tx, date, language, now)?;
    let body: String = tx
        .query_row("SELECT body FROM notes WHERE id = ?1", [&id], |row| {
            row.get(0)
        })
        .map_err(sql)?;
    let body = clean_body(&core::append_jot(
        &body,
        &text,
        minutes,
        &core::daily_title(date, language),
    ));
    tx.execute(
        "UPDATE notes SET body = ?2, updated_at = ?3, revision = revision + 1 WHERE id = ?1",
        params![id, body, stamp(now)],
    )
    .map_err(sql)?;
    derive(&tx, &id, &body)?;
    tx.commit().map_err(sql)?;
    Ok(id)
}

// --------------------------------------------------------------------- list

/// Folders and notes for the Notes tab, newest first with pinned on top.
pub fn list(connection: &Connection, clock: &Clock) -> Result<NotesList> {
    let mut statement = connection
        .prepare(
            "SELECT f.id, f.name, f.role,
                (SELECT COUNT(*) FROM notes n WHERE n.folder_id = f.id AND n.deleted_at IS NULL)
             FROM note_folders f WHERE f.deleted_at IS NULL
             ORDER BY f.role = 'daily' DESC, f.position, f.name_key",
        )
        .map_err(sql)?;
    let folders = statement
        .query_map([], |row| {
            Ok(NoteFolder {
                id: row.get(0)?,
                name: row.get(1)?,
                role: row.get(2)?,
                count: row.get(3)?,
            })
        })
        .map_err(sql)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(sql)?;

    let mut statement = connection
        .prepare(
            "SELECT n.id, n.folder_id, n.title, n.preview, n.open_tasks, n.done_tasks,
                    n.pinned_at IS NOT NULL, n.created_at, n.updated_at,
                    (SELECT GROUP_CONCAT(t.name, char(31)) FROM note_tag_links l
                       JOIN note_tags t ON t.id = l.tag_id WHERE l.note_id = n.id)
             FROM notes n JOIN note_folders f ON f.id = n.folder_id
             WHERE n.deleted_at IS NULL AND f.deleted_at IS NULL
             ORDER BY n.pinned_at IS NULL, n.updated_at DESC",
        )
        .map_err(sql)?;
    let notes = statement
        .query_map([], |row| {
            let updated_at: String = row.get(8)?;
            let tags: Option<String> = row.get(9)?;
            let (group, group_label) = group_of(&updated_at, clock);
            Ok(NoteSummary {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                title: row.get(2)?,
                preview: row.get(3)?,
                open_tasks: row.get(4)?,
                done_tasks: row.get(5)?,
                pinned: row.get(6)?,
                created_at: row.get(7)?,
                updated_at,
                tags: tags
                    .map(|tags| tags.split('\u{1f}').map(str::to_owned).collect())
                    .unwrap_or_default(),
                group,
                group_label,
            })
        })
        .map_err(sql)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(sql)?;

    let trash_count: u32 = connection
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE deleted_at IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .map_err(sql)?;
    Ok(NotesList {
        folders,
        notes,
        trash_count,
    })
}

/// The list heading a note edited at `updated_at` goes under.
fn group_of(updated_at: &str, clock: &Clock) -> (String, String) {
    let Some(day) = DateTime::parse_from_rfc3339(updated_at).ok().map(|time| {
        time.with_timezone(&sajilo_core::nepal_time::offset())
            .date_naive()
    }) else {
        return ("older".to_owned(), String::new());
    };
    let days = (clock.today - day).num_days();
    let (group, labels) = match days {
        ..=0 => ("today", ("Today", "आज")),
        1 => ("yesterday", ("Yesterday", "हिजो")),
        2..=6 => ("week", ("This week", "यो हप्ता")),
        _ => {
            let Ok(bs) = sajilo_core::calendar::bikram_sambat::nepali_date_from(day) else {
                return ("older".to_owned(), String::new());
            };
            let label = match clock.language {
                Language::En => format!("{} {}", bs.english_month_name(), bs.year),
                Language::Ne => format!(
                    "{} {}",
                    bs.nepali_month_name(),
                    sajilo_core::numerals::devanagari(bs.year, None)
                ),
            };
            return (format!("{:04}-{:02}", bs.year, bs.month), label);
        }
    };
    let label = match clock.language {
        Language::En => labels.0,
        Language::Ne => labels.1,
    };
    (group.to_owned(), label.to_owned())
}

// ------------------------------------------------------------------- search

/// Notes matching every word of `query`, best first, optionally within one
/// folder. Each word also matches as the start of a longer one, so `काठ`
/// finds `काठमाडौं` and `budg` finds `budget`.
pub fn search(
    connection: &Connection,
    query: &str,
    folder_id: Option<&str>,
) -> Result<Vec<NoteSearchHit>> {
    let words: Vec<String> = core::normalized(query)
        .split_whitespace()
        .map(|word| {
            word.trim_matches(|c: char| !c.is_alphanumeric() && !is_mark(c))
                .to_owned()
        })
        .filter(|word| !word.is_empty())
        .collect();
    if words.is_empty() {
        return Ok(Vec::new());
    }
    // Each word quoted (so FTS5 reads it as text, not syntax), then `*`.
    let match_expr = words
        .iter()
        .map(|word| format!("\"{}\"*", word.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ");
    let mut statement = connection
        .prepare(
            "SELECT n.id, n.folder_id,
                    highlight(note_search, 1, char(1), char(2)),
                    snippet(note_search, 2, char(1), char(2), '…', 14)
             FROM note_search s JOIN notes n ON n.id = s.note_id
             JOIN note_folders f ON f.id = n.folder_id
             WHERE note_search MATCH ?1 AND n.deleted_at IS NULL AND f.deleted_at IS NULL
               AND (?2 IS NULL OR n.folder_id = ?2)
             ORDER BY bm25(note_search, 0.0, 6.0, 1.0, 3.0)
             LIMIT ?3",
        )
        .map_err(sql)?;
    let hits = statement
        .query_map(params![match_expr, folder_id, SEARCH_LIMIT], |row| {
            Ok(NoteSearchHit {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                title: marked(&row.get::<_, String>(2)?),
                snippet: marked(&row.get::<_, String>(3)?),
            })
        })
        .map_err(sql)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(sql)?;
    Ok(hits)
}

fn is_mark(c: char) -> bool {
    matches!(c, '\u{0900}'..='\u{0903}' | '\u{093A}'..='\u{094F}' | '\u{0951}'..='\u{0957}' | '\u{0962}'..='\u{0963}')
}

/// Splits text FTS5 marked with \x01…\x02 into plain and matched parts,
/// Markdown symbols taken out of the plain ones.
fn marked(text: &str) -> Vec<NoteTextPart> {
    let mut parts = Vec::new();
    let mut hit = false;
    let mut current = String::new();
    for c in text.chars() {
        match c {
            '\u{1}' | '\u{2}' => {
                if !current.is_empty() {
                    parts.push(NoteTextPart {
                        text: std::mem::take(&mut current),
                        hit,
                    });
                }
                hit = c == '\u{1}';
            }
            '\n' => current.push(' '),
            '#' | '*' | '`' | '[' | ']' | '>' | '=' | '~' if !hit => {}
            c => current.push(c),
        }
    }
    if !current.is_empty() {
        parts.push(NoteTextPart { text: current, hit });
    }
    parts
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        crate::db::prepare(&connection).unwrap();
        ensure_ready(&mut connection, Language::En, now()).unwrap();
        connection
    }

    fn now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-09-30T06:00:00Z")
            .unwrap()
            .with_timezone(&Utc)
    }

    fn clock() -> Clock {
        Clock {
            now: now(),
            today: NaiveDate::from_ymd_opt(2026, 9, 30).unwrap(),
            language: Language::En,
        }
    }

    fn folder(connection: &Connection, name: &str) -> String {
        list(connection, &clock())
            .unwrap()
            .folders
            .into_iter()
            .find(|folder| folder.name == name)
            .unwrap()
            .id
    }

    #[test]
    fn starts_with_daily_office_personal_and_a_welcome_note() {
        let mut connection = fresh();
        ensure_ready(&mut connection, Language::En, now()).unwrap();
        let listed = list(&connection, &clock()).unwrap();
        let names: Vec<_> = listed.folders.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(
            names,
            ["Daily", "Office", "Personal"],
            "seeded once, not twice"
        );
        assert_eq!(listed.notes.len(), 1);
        assert_eq!(listed.notes[0].title, "Welcome to Notes");
        assert_eq!(listed.notes[0].open_tasks, 2);
        assert_eq!(listed.notes[0].tags, ["ideas"]);
        assert_eq!(listed.notes[0].group, "today");
    }

    #[test]
    fn saves_derive_everything_and_stale_saves_are_refused() {
        let mut connection = fresh();
        let office = folder(&connection, "Office");
        let id = create_note(&mut connection, &office, "", now()).unwrap();
        let saved = save_note(
            &mut connection,
            &id,
            "Budget review\nWith [[Ramesh]] #meeting #काम\n- [ ] Send sheet",
            1,
            now(),
        )
        .unwrap();
        assert_eq!((saved.title.as_str(), saved.revision), ("Budget review", 2));
        assert!(save_note(&mut connection, &id, "older text", 1, now()).is_err());

        let other = create_note(&mut connection, &office, "Ramesh\nFinance lead", now()).unwrap();
        let opened = open_note(&connection, &other, now()).unwrap();
        assert_eq!(opened.linked_from.len(), 1);
        assert_eq!(opened.linked_from[0].line, "With Ramesh #meeting #काम");

        let summary = list(&connection, &clock()).unwrap().notes;
        let budget = summary.iter().find(|note| note.id == id).unwrap();
        assert_eq!(budget.tags, ["meeting", "काम"]);
        assert_eq!(budget.open_tasks, 1);
    }

    #[test]
    fn search_finds_english_and_nepali_words_and_their_starts() {
        let mut connection = fresh();
        let personal = folder(&connection, "Personal");
        create_note(
            &mut connection,
            &personal,
            "पोखरा यात्रा\nकाठमाडौंबाट बस भाडा",
            now(),
        )
        .unwrap();
        create_note(
            &mut connection,
            &personal,
            "Budget 2083\nhosting costs",
            now(),
        )
        .unwrap();
        let find = |query: &str| {
            search(&connection, query, None)
                .unwrap()
                .into_iter()
                .map(|hit| {
                    hit.title
                        .iter()
                        .map(|part| part.text.clone())
                        .collect::<String>()
                })
                .collect::<Vec<_>>()
        };
        assert_eq!(find("यात्रा"), ["पोखरा यात्रा"]);
        assert_eq!(
            find("काठमाडौं"),
            ["पोखरा यात्रा"],
            "the start of a longer word"
        );
        assert_eq!(find("budg host"), ["Budget 2083"]);
        assert!(find("\"*)(").is_empty(), "syntax in a query is only text");
        let hit = &search(&connection, "hosting", None).unwrap()[0];
        assert!(
            hit.snippet
                .iter()
                .any(|part| part.hit && part.text == "hosting")
        );
    }

    #[test]
    fn folders_are_unique_ignoring_case_and_never_lose_notes() {
        let mut connection = fresh();
        assert!(create_folder(&mut connection, "office", now()).is_err());
        let office = folder(&connection, "Office");
        assert!(delete_folder(&connection, &office, now()).is_ok(), "empty");
        let daily = folder(&connection, "Daily");
        assert!(delete_folder(&connection, &daily, now()).is_err());

        let personal = folder(&connection, "Personal");
        assert!(
            delete_folder(&connection, &personal, now()).is_err(),
            "holds the welcome note"
        );
        let work = create_folder(&mut connection, "Work", now()).unwrap();
        let id = create_note(&mut connection, &work, "Plan", now()).unwrap();
        trash_note(&connection, &id, now()).unwrap();
        delete_folder(&connection, &work, now()).unwrap();
        restore_note(&mut connection, &id, now()).unwrap();
        let back = list(&connection, &clock())
            .unwrap()
            .notes
            .into_iter()
            .find(|n| n.id == id)
            .unwrap();
        assert_eq!(
            back.folder_id, personal,
            "its folder went, so it lands in the first one"
        );
    }

    #[test]
    fn the_trash_lists_counts_down_and_deletes_only_what_is_in_it() {
        let mut connection = fresh();
        let personal = folder(&connection, "Personal");
        let keep = create_note(&mut connection, &personal, "Keep me", now()).unwrap();
        let old = create_note(&mut connection, &personal, "Old", now()).unwrap();
        let new = create_note(&mut connection, &personal, "New", now()).unwrap();
        trash_note(
            &connection,
            &old,
            now() - Duration::days(29) - Duration::hours(12),
        )
        .unwrap();
        trash_note(&connection, &new, now()).unwrap();

        let listed = trash(&connection, now()).unwrap();
        let days: Vec<_> = listed
            .iter()
            .map(|note| (note.title.as_str(), note.days_left))
            .collect();
        assert_eq!(days, [("New", 30), ("Old", 1)]);
        assert_eq!(list(&connection, &clock()).unwrap().trash_count, 2);

        delete_forever(&mut connection, Some(&keep)).unwrap();
        assert!(
            open_note(&connection, &keep, now()).is_ok(),
            "not in the Trash, so kept"
        );
        delete_forever(&mut connection, Some(&new)).unwrap();
        assert_eq!(trash(&connection, now()).unwrap().len(), 1);
        delete_forever(&mut connection, None).unwrap();
        assert!(trash(&connection, now()).unwrap().is_empty());
    }

    #[test]
    fn the_welcome_note_speaks_the_app_language() {
        let mut connection = Connection::open_in_memory().unwrap();
        crate::db::prepare(&connection).unwrap();
        ensure_ready(&mut connection, Language::Ne, now()).unwrap();
        let notes = list(&connection, &clock()).unwrap().notes;
        assert_eq!(notes[0].title, "नोटमा स्वागत छ");
        assert_eq!(notes[0].tags, ["विचार"]);
    }

    #[test]
    fn jots_land_in_one_daily_note_and_the_trash_empties_after_30_days() {
        let mut connection = fresh();
        let date = NepaliDate::new(2083, 6, 14);
        let first = jot(&mut connection, "Standup", date, 600, Language::En, now()).unwrap();
        let second = jot(
            &mut connection,
            "[] Call dai",
            date,
            605,
            Language::En,
            now(),
        )
        .unwrap();
        assert_eq!(first, second);
        let body = open_note(&connection, &first, now()).unwrap().body;
        assert_eq!(
            body,
            "# Ashwin 14, 2083\n\n### 10:00\nStandup\n\n- [ ] Call dai\n"
        );

        trash_note(&connection, &first, now()).unwrap();
        assert_eq!(
            daily_note(&mut connection, date, Language::En, now()).unwrap(),
            first,
            "brought back"
        );
        trash_note(&connection, &first, now()).unwrap();
        purge_trash(&mut connection, now() + Duration::days(31)).unwrap();
        assert!(open_note(&connection, &first, now()).is_err());
        assert!(search(&connection, "Standup", None).unwrap().is_empty());
    }
}
