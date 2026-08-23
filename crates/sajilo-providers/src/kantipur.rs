//! Kantipur headlines, read from the JSON endpoint its own site is built on.
//!
//! Kantipur publishes no RSS feed — `/rss`, `/feed` and every sitemap path all
//! return the site's HTML 404 page — and it is the one paper here big enough
//! that leaving it out is felt. What it does have is
//! `api.ekantipur.com/kantipur/v4/social/newslist`: the keyless, public JSON
//! call `ekantipur.com` makes to fill its own breaking-news ticker. Reading
//! that is not scraping. It is a stable, typed contract that survives the page
//! redesigns a CSS selector would not.
//!
//! Only the headline, the link and the timestamp are read. The response also
//! carries `story` — the entire article body, some three kilobytes of it per
//! item — and none of it is touched, for the same reason OnlineKhabar's
//! `content:encoded` is not: being handed an article is not a licence to
//! republish it.

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use sajilo_api::news::{DatePrecision, NewsItem, NewsSource};
use serde::Deserialize;

use crate::error::Result;
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "Kantipur";

/// `limit` and `offset` are both honoured; anything else in the query string is
/// ignored. Thirty is roughly a day of filing, and enough that the round-robin
/// merge never runs the feed dry.
pub const NEWSLIST_URL: &str = "https://api.ekantipur.com/kantipur/v4/social/newslist?limit=30";

/// The endpoint's own success marker. It answers `200 OK` either way, so the
/// body is what says whether the call worked.
const STATUS_OK: i64 = 1;

pub async fn fetch(client: &HttpClient, limit: usize) -> Result<Vec<NewsItem>> {
    let body = client.get_text(SOURCE_NAME, NEWSLIST_URL).await?;
    Ok(parse(&body, limit))
}

/// Never fails: an unreadable body yields no headlines, and the merge reports
/// Kantipur as a source that went dark rather than dropping every other paper.
pub fn parse(body: &str, limit: usize) -> Vec<NewsItem> {
    let Ok(response) = serde_json::from_str::<Response>(body) else {
        return Vec::new();
    };
    if response.status != STATUS_OK {
        return Vec::new();
    }

    response
        .data
        .into_iter()
        .filter_map(build)
        .take(limit)
        .collect()
}

fn build(entry: Entry) -> Option<NewsItem> {
    let title = entry.title.trim();
    let link = entry.permalink.trim();
    if title.is_empty() || !link.starts_with("https://") {
        return None;
    }

    Some(NewsItem {
        title: title.to_owned(),
        link: link.to_owned(),
        source: NewsSource::Kantipur,
        source_name: NewsSource::Kantipur.display_name().to_owned(),
        published: parse_nepal_time(&entry.pub_date),
        precision: DatePrecision::Exact,
    })
}

/// `2026-08-23 22:27:46` — a Kathmandu wall clock, with no offset in the
/// string. Read as UTC it would date every story five and three quarter hours
/// into the future, and Kantipur would sit permanently at the top of a list
/// sorted newest-first.
fn parse_nepal_time(raw: &str) -> Option<DateTime<Utc>> {
    let naive = NaiveDateTime::parse_from_str(raw.trim(), "%Y-%m-%d %H:%M:%S").ok()?;
    sajilo_core::nepal_time::offset()
        .from_local_datetime(&naive)
        .single()
        .map(|stamped| stamped.with_timezone(&Utc))
}

/// The wire shape, kept separate from `NewsItem` so a field rename upstream
/// cannot reach the domain type. Every field the endpoint sends that Sajilo
/// does not read — `story`, `summary`, `thumb_path`, `tag_ids` — is absent
/// here on purpose.
#[derive(Deserialize)]
struct Response {
    status: i64,
    #[serde(default)]
    data: Vec<Entry>,
}

#[derive(Deserialize)]
struct Entry {
    title: String,
    permalink: String,
    #[serde(default)]
    pub_date: String,
}
