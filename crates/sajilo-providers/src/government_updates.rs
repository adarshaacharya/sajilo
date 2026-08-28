//! Official updates from Nepal Government's public updates API.
//!
//! The portal has no per-update detail route. Its own client fetches this JSON
//! collection and renders each full post, so Sajilo retains the complete text
//! and attachment metadata for an in-app reader instead of scraping the page.

use chrono::{DateTime, Utc};
use sajilo_api::news::{DatePrecision, NewsAttachment, NewsItem, NewsSource};
use serde::Deserialize;

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "Nepal Government";
pub const UPDATES_URL: &str = "https://nepal.gov.np/api/updates";
pub const PORTAL_URL: &str = "https://nepal.gov.np/updates";

pub async fn fetch(client: &HttpClient, limit: usize) -> Result<Vec<NewsItem>> {
    let body = client.get_text(SOURCE_NAME, UPDATES_URL).await?;
    parse(&body, limit)
}

pub fn parse(body: &str, limit: usize) -> Result<Vec<NewsItem>> {
    let response = serde_json::from_str::<WireResponse>(body)
        .map_err(|error| ProviderError::parse(SOURCE_NAME, error.to_string()))?
        .into_items();
    let mut updates: Vec<NewsItem> = response.into_iter().filter_map(build).collect();

    updates.sort_by_key(|update| std::cmp::Reverse(update.published));
    updates.truncate(limit);
    Ok(updates)
}

/// The portal originally returned a bare array, then moved to cursor-based
/// pagination in August 2026. Accepting both keeps older recordings useful and
/// prevents another server-side rollout from immediately breaking Sajilo.
#[derive(Deserialize)]
#[serde(untagged)]
enum WireResponse {
    List(Vec<WireUpdate>),
    Page { items: Vec<WireUpdate> },
}

impl WireResponse {
    fn into_items(self) -> Vec<WireUpdate> {
        match self {
            Self::List(items) | Self::Page { items } => items,
        }
    }
}

fn build(update: WireUpdate) -> Option<NewsItem> {
    if update.status != "APPROVED" {
        return None;
    }

    let id = update.id.trim();
    let title = update.title.trim();
    let content = update.content.trim().replace("\r\n", "\n");
    if id.is_empty() || title.is_empty() || content.is_empty() {
        return None;
    }

    let attachments = update
        .attachments
        .into_iter()
        .filter(|attachment| {
            !attachment.id.trim().is_empty() && !attachment.filename.trim().is_empty()
        })
        .map(|attachment| NewsAttachment {
            url: format!("{UPDATES_URL}/{id}/attachments/{}", attachment.id.trim()),
            id: attachment.id,
            filename: attachment.filename,
            mime_type: attachment.mime_type,
            size: u32::try_from(attachment.size).unwrap_or(u32::MAX),
        })
        .collect();

    let tags = update
        .tags
        .into_iter()
        .map(|entry| entry.tag.name.trim().to_owned())
        .filter(|name| !name.is_empty())
        .collect();

    Some(NewsItem {
        id: Some(id.to_owned()),
        title: title.to_owned(),
        link: format!("{PORTAL_URL}#update-{id}"),
        source: NewsSource::NepalGovernment,
        source_name: NewsSource::NepalGovernment.display_name().to_owned(),
        published: Some(update.created_at),
        precision: DatePrecision::Exact,
        content: Some(content),
        department: Some(update.author.department.trim().to_owned())
            .filter(|department| !department.is_empty()),
        tags,
        attachments,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireUpdate {
    id: String,
    title: String,
    content: String,
    status: String,
    created_at: DateTime<Utc>,
    author: WireAuthor,
    #[serde(default)]
    tags: Vec<WireTagEntry>,
    #[serde(default)]
    attachments: Vec<WireAttachment>,
}

#[derive(Deserialize)]
struct WireAuthor {
    #[serde(default)]
    department: String,
}

#[derive(Deserialize)]
struct WireTagEntry {
    tag: WireTag,
}

#[derive(Deserialize)]
struct WireTag {
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireAttachment {
    id: String,
    filename: String,
    #[serde(default)]
    mime_type: String,
    #[serde(default)]
    size: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_full_approved_update_and_attachment() {
        let body = r#"[
          {
            "id": "update-1",
            "title": " Official notice ",
            "content": "First paragraph.\r\n\r\nSecond paragraph.",
            "status": "APPROVED",
            "createdAt": "2026-08-27T13:11:58.574Z",
            "author": {"name": "Editor", "department": "Office of the Prime Minister"},
            "tags": [{"tag": {"name": "PUBLIC_SAFETY"}}],
            "attachments": [{"id": "file-1", "filename": "notice.pdf", "mimeType": "application/pdf", "size": 2048}]
          }
        ]"#;

        let updates = parse(body, 10).expect("valid response");
        let update = &updates[0];
        assert_eq!(update.id.as_deref(), Some("update-1"));
        assert_eq!(
            update.content.as_deref(),
            Some("First paragraph.\n\nSecond paragraph.")
        );
        assert_eq!(update.tags, ["PUBLIC_SAFETY"]);
        assert_eq!(update.attachments[0].filename, "notice.pdf");
        assert_eq!(
            update.attachments[0].url,
            "https://nepal.gov.np/api/updates/update-1/attachments/file-1"
        );
    }

    #[test]
    fn ignores_unapproved_or_incomplete_updates() {
        let body = r#"[
          {"id":"draft","title":"Draft","content":"Hidden","status":"PENDING","createdAt":"2026-08-27T13:00:00Z","author":{}},
          {"id":"empty","title":"","content":"Missing title","status":"APPROVED","createdAt":"2026-08-27T12:00:00Z","author":{}}
        ]"#;

        assert!(parse(body, 10).expect("valid response").is_empty());
    }

    #[test]
    fn accepts_the_portals_paginated_response() {
        let body = r#"{
          "items": [{
            "id": "update-2",
            "title": "Relief notice",
            "content": "Complete notice text.",
            "status": "APPROVED",
            "createdAt": "2026-08-28T15:07:04.906Z",
            "author": {"department": "Ministry of Home Affairs"},
            "tags": [],
            "attachments": []
          }],
          "nextCursor": "older-update"
        }"#;

        let updates = parse(body, 10).expect("valid paginated response");
        assert_eq!(updates.len(), 1);
        assert_eq!(updates[0].id.as_deref(), Some("update-2"));
        assert_eq!(
            updates[0].department.as_deref(),
            Some("Ministry of Home Affairs")
        );
    }
}
