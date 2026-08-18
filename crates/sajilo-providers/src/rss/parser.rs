//! One RSS feed into `NewsItem`s. Ported from `RSSParser.swift`.

use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use quick_xml::Reader;
use quick_xml::events::Event;
use sajilo_api::news::{DatePrecision, NewsItem, NewsSource};

/// A safety ceiling, not a page size: RSS has no pagination, so a feed returns
/// everything it is going to return in one response.
pub const DEFAULT_LIMIT: usize = 100;

/// Never fails: a malformed tail still yields the items read before it. A
/// missing date is survivable and a dropped feed is not, so this degrades
/// rather than raising.
pub fn parse(body: &str, source: NewsSource, limit: usize) -> Vec<NewsItem> {
    if limit == 0 {
        return Vec::new();
    }
    let mut reader = Reader::from_str(body);
    reader.config_mut().trim_text(true);

    let mut items = Vec::new();
    let mut inside_item = false;
    let mut field = String::new();
    let (mut title, mut link, mut pub_date) = (String::new(), String::new(), String::new());

    loop {
        match reader.read_event() {
            Ok(Event::Start(tag)) => {
                let name = local_name(tag.name().as_ref());
                if name == "item" || name == "entry" {
                    inside_item = true;
                    title.clear();
                    link.clear();
                    pub_date.clear();
                }
                field = name;
            }
            // Atom puts the link in an attribute rather than in text.
            Ok(Event::Empty(tag)) if inside_item && local_name(tag.name().as_ref()) == "link" => {
                if let Some(href) = tag
                    .attributes()
                    .flatten()
                    .find(|attr| attr.key.as_ref() == b"href")
                {
                    link = String::from_utf8_lossy(&href.value).into_owned();
                }
            }
            // CDATA is where several of these feeds keep the title, so both
            // event kinds feed the same buffers.
            Ok(event @ (Event::Text(_) | Event::CData(_))) if inside_item => {
                let value = match &event {
                    Event::Text(text) => String::from_utf8_lossy(text).into_owned(),
                    Event::CData(data) => String::from_utf8_lossy(data).into_owned(),
                    _ => unreachable!("the guard above admits only Text and CData"),
                };
                match field.as_str() {
                    "title" => title.push_str(&value),
                    "link" | "guid" if link.is_empty() => link.push_str(&value),
                    "pubdate" | "date" | "published" | "updated" => pub_date.push_str(&value),
                    _ => {}
                }
            }
            Ok(Event::End(tag)) => {
                let name = local_name(tag.name().as_ref());
                field.clear();
                if name != "item" && name != "entry" {
                    continue;
                }
                inside_item = false;

                if let Some(item) = build(&title, &link, &pub_date, source) {
                    items.push(item);
                }
                if items.len() >= limit {
                    break;
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    items
}

/// `<dc:date>` and `<date>` must land in the same bucket, so the namespace
/// prefix is dropped and the name lowercased.
fn local_name(raw: &[u8]) -> String {
    let name = String::from_utf8_lossy(raw);
    name.rsplit(':').next().unwrap_or(&name).to_lowercase()
}

fn build(title: &str, link: &str, pub_date: &str, source: NewsSource) -> Option<NewsItem> {
    let title = title.trim();
    let link = link.trim();
    // Only ever hand the browser a web link.
    if title.is_empty() || !(link.starts_with("http://") || link.starts_with("https://")) {
        return None;
    }

    // A real `pubDate` always wins; the URL is only consulted when the feed
    // gave nothing, and is day-precise, which the item records so the UI never
    // renders it as an hour-accurate time.
    let feed_date = parse_date(pub_date);
    let link_date = if feed_date.is_none() {
        date_from_link_path(link)
    } else {
        None
    };

    Some(NewsItem {
        title: title.to_owned(),
        link: link.to_owned(),
        source,
        source_name: source.display_name().to_owned(),
        published: feed_date.or(link_date),
        precision: if link_date.is_none() {
            DatePrecision::Exact
        } else {
            DatePrecision::Day
        },
    })
}

/// RSS dates are RFC 822. Feeds vary on whether seconds and the zone are
/// present, so several shapes are tried before giving up — a missing date is
/// survivable, a crash is not.
pub fn parse_date(raw: &str) -> Option<DateTime<Utc>> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Ok(date) = DateTime::parse_from_rfc2822(trimmed) {
        return Some(date.with_timezone(&Utc));
    }
    // Atom feeds use RFC 3339 instead.
    if let Ok(date) = DateTime::parse_from_rfc3339(trimmed) {
        return Some(date.with_timezone(&Utc));
    }

    for format in [
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M %z",
        "%d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S %Z",
    ] {
        if let Ok(date) = DateTime::parse_from_str(trimmed, format) {
            return Some(date.with_timezone(&Utc));
        }
    }
    None
}

/// Some feeds ship no `pubDate` but spell the date out in the article URL —
/// `/national/2026/08/16/landslides-…`. Reading it there costs nothing and is
/// exactly as precise as the paper's own "Published at" line, so it is
/// preferred over leaving the story undated.
///
/// The result is midnight *Nepal time*, not UTC — the paper's day is a Nepali
/// day.
pub fn date_from_link_path(link: &str) -> Option<DateTime<Utc>> {
    let parts: Vec<&str> = link.split('/').collect();
    for window in parts.windows(3) {
        let (year, month, day) = (window[0], window[1], window[2]);
        if year.len() != 4 || month.len() != 2 || day.len() != 2 {
            continue;
        }
        let (Ok(year), Ok(month), Ok(day)) = (
            year.parse::<i32>(),
            month.parse::<u32>(),
            day.parse::<u32>(),
        ) else {
            continue;
        };
        if year <= 1900 {
            continue;
        }
        if let Some(date) = NaiveDate::from_ymd_opt(year, month, day) {
            return sajilo_core::nepal_time::offset()
                .from_local_datetime(&date.and_hms_opt(0, 0, 0)?)
                .single()
                .map(|dt| dt.with_timezone(&Utc));
        }
    }
    None
}
