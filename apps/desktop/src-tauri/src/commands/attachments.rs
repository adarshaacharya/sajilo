//! Photos on Keeper documents and reminders — a passport's data page, a bill's
//! receipt.
//!
//! Images live in the same SQLite file as everything else, so a backup (a
//! single `VACUUM INTO`) carries them without a second folder to lose. Each is
//! stored twice: a copy scaled to at most `FULL_EDGE` on its long side, and a
//! small thumbnail for lists, both re-encoded as JPEG so a 12 MB phone photo
//! costs a few hundred kilobytes. EXIF orientation is applied on the way in,
//! so nothing downstream has to know about it.

use std::io::Cursor;

use base64::Engine as _;
use chrono::Utc;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, ImageDecoder, ImageReader};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Wry};

use crate::db;

type Result<T> = std::result::Result<T, String>;

/// Long edge of the stored copy: sharp enough to read a document number on a
/// laptop screen, small enough that fifty photos stay a few megabytes each.
const FULL_EDGE: u32 = 2000;
const THUMB_EDGE: u32 = 240;
const FULL_QUALITY: u8 = 85;
const THUMB_QUALITY: u8 = 78;
/// Per document or reminder. A handful of pages is the real use.
pub const MAX_PER_OWNER: usize = 10;
/// Anything bigger than this is not a photo of a paper.
const MAX_INPUT_BYTES: usize = 40 * 1024 * 1024;

pub const VIEWER_LABEL: &str = "viewer";

/// A photo, as lists need it: no full-size bytes, just the thumbnail inline.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeeperAttachment {
    pub id: String,
    pub owner_kind: String,
    pub owner_id: String,
    pub width: u32,
    pub height: u32,
    /// `data:image/jpeg;base64,…` — small enough to ship with the list.
    pub thumbnail: String,
    pub created_at: String,
}

fn check_owner_kind(kind: &str) -> Result<()> {
    match kind {
        "record" | "item" => Ok(()),
        _ => Err("Photos can only be added to documents and reminders.".to_owned()),
    }
}

fn new_id() -> String {
    // Unique enough for a row key in one household's database: time plus a
    // little of the process's own randomness.
    let nanos = Utc::now().timestamp_nanos_opt().unwrap_or_default();
    let salt = std::collections::hash_map::RandomState::new();
    let mixed = std::hash::BuildHasher::hash_one(&salt, nanos);
    format!("att-{nanos:x}-{mixed:x}")
}

/// Decodes any supported image, applies its EXIF orientation, and returns the
/// stored copy and the thumbnail as JPEG, plus the stored copy's size.
fn prepare(bytes: &[u8]) -> Result<(Vec<u8>, Vec<u8>, u32, u32)> {
    if bytes.len() > MAX_INPUT_BYTES {
        return Err("That file is too large to be a photo.".to_owned());
    }
    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| error.to_string())?;
    let mut decoder = reader.into_decoder().map_err(|_| unsupported())?;
    let orientation = decoder.orientation().ok();
    let mut image = DynamicImage::from_decoder(decoder).map_err(|_| unsupported())?;
    if let Some(orientation) = orientation {
        image.apply_orientation(orientation);
    }
    let full = fit(image.clone(), FULL_EDGE);
    let (width, height) = (full.width(), full.height());
    let thumb = fit(image, THUMB_EDGE);
    Ok((
        encode(&full, FULL_QUALITY)?,
        encode(&thumb, THUMB_QUALITY)?,
        width,
        height,
    ))
}

fn unsupported() -> String {
    "That file isn't a photo Sajilo can read. Use JPEG, PNG, WebP, or HEIC exported as JPEG."
        .to_owned()
}

fn fit(image: DynamicImage, edge: u32) -> DynamicImage {
    if image.width() <= edge && image.height() <= edge {
        image
    } else {
        image.resize(edge, edge, FilterType::Lanczos3)
    }
}

fn encode(image: &DynamicImage, quality: u8) -> Result<Vec<u8>> {
    // JPEG has no alpha; a transparent screenshot is flattened onto white.
    let rgb = image.to_rgb8();
    let mut out = Vec::new();
    JpegEncoder::new_with_quality(&mut out, quality)
        .encode_image(&rgb)
        .map_err(|error| error.to_string())?;
    Ok(out)
}

fn data_url(jpeg: &[u8]) -> String {
    format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(jpeg)
    )
}

fn insert(app: &AppHandle<Wry>, kind: &str, owner: &str, bytes: &[u8]) -> Result<KeeperAttachment> {
    check_owner_kind(kind)?;
    let connection = db::open(app)?;
    let count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM keeper_attachments WHERE owner_kind = ?1 AND owner_id = ?2",
            params![kind, owner],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if usize::try_from(count).unwrap_or(usize::MAX) >= MAX_PER_OWNER {
        return Err(format!("Up to {MAX_PER_OWNER} photos each."));
    }
    let (full, thumb, width, height) = prepare(bytes)?;
    let id = new_id();
    let created_at = Utc::now().to_rfc3339();
    connection
        .execute(
            "INSERT INTO keeper_attachments
               (id, owner_kind, owner_id, position, width, height, image, thumbnail, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id, kind, owner, count, width, height, full, thumb, created_at
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(KeeperAttachment {
        id,
        owner_kind: kind.to_owned(),
        owner_id: owner.to_owned(),
        width,
        height,
        thumbnail: data_url(&thumb),
        created_at,
    })
}

#[tauri::command]
pub fn list_keeper_attachments(
    app: AppHandle<Wry>,
    owner_kind: String,
    owner_id: String,
) -> Result<Vec<KeeperAttachment>> {
    check_owner_kind(&owner_kind)?;
    let connection = db::open(&app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, width, height, thumbnail, created_at FROM keeper_attachments
             WHERE owner_kind = ?1 AND owner_id = ?2 ORDER BY position, created_at",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![owner_kind, owner_id], |row| {
            Ok(KeeperAttachment {
                id: row.get(0)?,
                owner_kind: owner_kind.clone(),
                owner_id: owner_id.clone(),
                width: row.get(1)?,
                height: row.get(2)?,
                thumbnail: data_url(&row.get::<_, Vec<u8>>(3)?),
                created_at: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

/// Adds photos from files on disk — the file picker and drag-and-drop both
/// hand over paths. Stops at the first file that fails, keeping the ones
/// before it.
#[tauri::command]
pub async fn add_keeper_attachments_from_paths(
    app: AppHandle<Wry>,
    owner_kind: String,
    owner_id: String,
    paths: Vec<String>,
) -> Result<Vec<KeeperAttachment>> {
    blocking(move || {
        let mut added = Vec::new();
        for path in paths {
            let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
            added.push(insert(&app, &owner_kind, &owner_id, &bytes)?);
        }
        Ok(added)
    })
    .await
}

/// Decoding and scaling a phone photo takes a moment; it happens off the main
/// thread so the popover never stalls.
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| error.to_string())?
}

/// Adds one photo from raw bytes — a pasted screenshot. The owner travels in
/// headers so the body can be the image itself rather than a JSON number
/// array.
#[tauri::command]
pub async fn add_keeper_attachment_bytes(
    app: AppHandle<Wry>,
    request: Request<'_>,
) -> Result<KeeperAttachment> {
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned)
            .ok_or_else(|| format!("Missing {name}."))
    };
    let kind = header("x-owner-kind")?;
    let owner = header("x-owner-id")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected the image bytes.".to_owned());
    };
    let bytes = bytes.clone();
    blocking(move || insert(&app, &kind, &owner, &bytes)).await
}

/// The stored copy, as raw JPEG bytes for the viewer.
#[tauri::command]
pub fn get_keeper_attachment(app: AppHandle<Wry>, id: String) -> Result<Response> {
    let connection = db::open(&app)?;
    let bytes: Option<Vec<u8>> = connection
        .query_row(
            "SELECT image FROM keeper_attachments WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    bytes
        .map(Response::new)
        .ok_or_else(|| "That photo no longer exists.".to_owned())
}

#[tauri::command]
pub fn delete_keeper_attachment(app: AppHandle<Wry>, id: String) -> Result<()> {
    db::open(&app)?
        .execute("DELETE FROM keeper_attachments WHERE id = ?1", [id])
        .map(|_| ())
        .map_err(|error| error.to_string())
}

/// Turns a photo a quarter clockwise, both the stored copy and its thumbnail.
#[tauri::command]
pub async fn rotate_keeper_attachment(app: AppHandle<Wry>, id: String) -> Result<KeeperAttachment> {
    blocking(move || rotate(&app, id)).await
}

fn rotate(app: &AppHandle<Wry>, id: String) -> Result<KeeperAttachment> {
    let connection = db::open(app)?;
    let (kind, owner, bytes, created_at): (String, String, Vec<u8>, String) = connection
        .query_row(
            "SELECT owner_kind, owner_id, image, created_at FROM keeper_attachments WHERE id = ?1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|error| error.to_string())?;
    let image = image::load_from_memory(&bytes)
        .map_err(|error| error.to_string())?
        .rotate90();
    let (width, height) = (image.width(), image.height());
    let full = encode(&image, FULL_QUALITY)?;
    let thumb = encode(&fit(image, THUMB_EDGE), THUMB_QUALITY)?;
    connection
        .execute(
            "UPDATE keeper_attachments SET image = ?1, thumbnail = ?2, width = ?3, height = ?4
             WHERE id = ?5",
            params![full, thumb, width, height, id],
        )
        .map_err(|error| error.to_string())?;
    Ok(KeeperAttachment {
        id,
        owner_kind: kind,
        owner_id: owner,
        width,
        height,
        thumbnail: data_url(&thumb),
        created_at,
    })
}

/// Saves a copy of the stored photo wherever the user picked.
#[tauri::command]
pub fn export_keeper_attachment(
    app: AppHandle<Wry>,
    id: String,
    destination: String,
) -> Result<()> {
    let connection = db::open(&app)?;
    let bytes: Vec<u8> = connection
        .query_row(
            "SELECT image FROM keeper_attachments WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    std::fs::write(destination, bytes).map_err(|error| error.to_string())
}

/// Removes every photo of one document or reminder — when it is deleted, or
/// when a new one is abandoned before it was ever saved.
#[tauri::command]
pub fn discard_keeper_attachments(
    app: AppHandle<Wry>,
    owner_kind: String,
    owner_id: String,
) -> Result<()> {
    delete_for_owner(&app, &owner_kind, &owner_id)
}

pub fn delete_for_owner(app: &AppHandle<Wry>, owner_kind: &str, owner_id: &str) -> Result<()> {
    db::open(app)?
        .execute(
            "DELETE FROM keeper_attachments WHERE owner_kind = ?1 AND owner_id = ?2",
            params![owner_kind, owner_id],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

/// Photos whose document or reminder is gone and that are more than a day
/// old: a form closed some other way than Cancel. The day's grace keeps an
/// open, not-yet-saved form's photos safe.
pub fn prune_orphans(app: &AppHandle<Wry>) -> Result<()> {
    let cutoff = (Utc::now() - chrono::Duration::days(1)).to_rfc3339();
    db::open(app)?
        .execute(
            "DELETE FROM keeper_attachments WHERE created_at < ?1 AND (
               (owner_kind = 'record' AND owner_id NOT IN (SELECT id FROM keeper_records)) OR
               (owner_kind = 'item' AND owner_id NOT IN (SELECT id FROM keeper_items)))",
            [cutoff],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

/// Opens (or re-aims) the photo viewer: a real, resizable window, since the
/// popover is far too small to read a document in.
#[tauri::command]
pub fn open_keeper_viewer(
    app: AppHandle<Wry>,
    owner_kind: String,
    owner_id: String,
    index: usize,
) -> Result<()> {
    check_owner_kind(&owner_kind)?;
    let query = format!("surface=viewer&kind={owner_kind}&owner={owner_id}&index={index}");
    if let Some(existing) = app.get_webview_window(VIEWER_LABEL) {
        let url = existing
            .url()
            .map_err(|error| error.to_string())?
            .join(&format!("index.html?{query}"))
            .map_err(|error| error.to_string())?;
        existing.navigate(url).map_err(|error| error.to_string())?;
        let _ = existing.show();
        return existing.set_focus().map_err(|error| error.to_string());
    }
    WebviewWindowBuilder::new(
        &app,
        VIEWER_LABEL,
        WebviewUrl::App(format!("index.html?{query}").into()),
    )
    .title("Sajilo — Photos")
    .inner_size(880.0, 640.0)
    .min_inner_size(420.0, 320.0)
    .center()
    .resizable(true)
    .background_color(tauri::webview::Color(20, 20, 22, 255))
    .build()
    .map(|_| ())
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(width: u32, height: u32) -> Vec<u8> {
        let image = DynamicImage::new_rgba8(width, height);
        let mut out = Vec::new();
        image
            .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
            .unwrap();
        out
    }

    #[test]
    fn a_large_photo_is_scaled_to_the_stored_edge() {
        let (full, thumb, width, height) = prepare(&png(4000, 3000)).unwrap();
        assert_eq!((width, height), (2000, 1500));
        let thumb = image::load_from_memory(&thumb).unwrap();
        assert_eq!(thumb.width().max(thumb.height()), THUMB_EDGE);
        assert!(image::load_from_memory(&full).is_ok());
    }

    #[test]
    fn a_small_photo_is_not_enlarged() {
        let (_, _, width, height) = prepare(&png(640, 480)).unwrap();
        assert_eq!((width, height), (640, 480));
    }

    #[test]
    fn a_file_that_is_not_an_image_is_refused_plainly() {
        let error = prepare(b"%PDF-1.7 not a photo").unwrap_err();
        assert!(error.contains("isn't a photo"));
    }
}
