//! Reads only from `fixtures/kantipur/`.

use chrono::{TimeZone, Utc};
use sajilo_api::news::{DatePrecision, NewsSource};
use sajilo_providers::kantipur;

const NEWSLIST: &str = include_str!("../../../fixtures/kantipur/newslist.json");

#[test]
fn decodes_a_recorded_response() {
    let items = kantipur::parse(NEWSLIST, 100);
    assert_eq!(items.len(), 10, "the fixture was recorded with limit=10");
    assert!(items.iter().all(|item| !item.title.is_empty()));
    assert!(
        items
            .iter()
            .all(|item| item.link.starts_with("https://ekantipur.com/"))
    );
    assert!(items.iter().all(|item| item.source == NewsSource::Kantipur));
    assert!(items.iter().all(|item| item.source_name == "Kantipur"));
}

/// Kantipur times a story to the second — better than any of the nine feeds —
/// so every item takes part in the newest-first ranking.
#[test]
fn every_headline_is_exactly_timed() {
    let items = kantipur::parse(NEWSLIST, 100);
    assert!(items.iter().all(|item| item.published.is_some()));
    assert!(
        items
            .iter()
            .all(|item| item.precision == DatePrecision::Exact)
    );
}

/// `pub_date` is a Kathmandu wall clock with no offset written down. The first
/// recorded item reads `2026-08-23 22:27:46`, which is 16:42:46 UTC — not
/// 22:27:46 UTC, which would date it five and three quarter hours into the
/// future and pin Kantipur to the top of the list forever.
#[test]
fn reads_the_timestamp_as_nepal_time() {
    let items = kantipur::parse(NEWSLIST, 100);
    let first = items.first().expect("the fixture carries headlines");
    assert_eq!(
        first.published,
        Some(Utc.with_ymd_and_hms(2026, 8, 23, 16, 42, 46).unwrap())
    );
}

#[test]
fn honours_the_limit() {
    assert_eq!(kantipur::parse(NEWSLIST, 3).len(), 3);
    assert!(kantipur::parse(NEWSLIST, 0).is_empty());
}

/// The endpoint answers `200 OK` whatever happened, so the body's own status is
/// what decides. A failure must read as no headlines, never as a partial list
/// presenting itself as the day's news.
#[test]
fn rejects_a_body_that_reports_failure() {
    assert!(kantipur::parse(r#"{"status":0,"message":"error","data":[]}"#, 10).is_empty());
    assert!(kantipur::parse("<html>404</html>", 10).is_empty());
    assert!(kantipur::parse("", 10).is_empty());
}

/// An item missing the fields Sajilo actually reads is dropped, and the rest of
/// the response still arrives.
#[test]
fn skips_unusable_entries() {
    let body = r#"{"status":1,"data":[
        {"title":"","permalink":"https://ekantipur.com/a.html","pub_date":"2026-08-23 10:00:00"},
        {"title":"No link","permalink":"","pub_date":"2026-08-23 10:00:00"},
        {"title":"Good","permalink":"https://ekantipur.com/b.html","pub_date":"2026-08-23 10:00:00"}
    ]}"#;
    let items = kantipur::parse(body, 10);
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].title, "Good");
}

/// The article body ships in the response and is deliberately never read.
#[test]
fn carries_no_article_text() {
    assert!(
        NEWSLIST.contains("\"story\""),
        "the fixture should still hold the field this test is about"
    );
    let items = kantipur::parse(NEWSLIST, 100);
    // Only a headline is short; an article body would not be.
    assert!(items.iter().all(|item| item.title.len() < 400));
}
