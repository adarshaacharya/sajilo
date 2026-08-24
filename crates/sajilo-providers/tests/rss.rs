//! Reads only from `fixtures/rss/`.

use chrono::{TimeZone, Timelike, Utc};
use sajilo_api::news::{DatePrecision, NewsItem, NewsSource};
use sajilo_providers::rss::{self, parser};

const KATHMANDU_POST: &str = include_str!("../../../fixtures/rss/kathmandupost.xml");
const ONLINE_KHABAR: &str = include_str!("../../../fixtures/rss/onlinekhabar.xml");
/// Recorded from The Himalayan Times before it went behind a bot challenge.
/// The paper is no longer a source; the fixture stays because it is the only
/// real-world example of a feed escaping HTML entities inside CDATA, which the
/// parser has to undo for every feed that does it next.
const ENTITIES_IN_CDATA: &str = include_str!("../../../fixtures/rss/himalayantimes-nepal.xml");

#[test]
fn decodes_a_recorded_feed() {
    let items = parser::parse(ONLINE_KHABAR, NewsSource::OnlineKhabar, 100);
    assert!(items.len() > 10, "got {}", items.len());
    assert!(items.iter().all(|item| !item.title.is_empty()));
    assert!(items.iter().all(|item| item.link.starts_with("https://")));
    assert!(
        items
            .iter()
            .all(|item| item.source == NewsSource::OnlineKhabar)
    );
}

/// OnlineKhabar ships a real `pubDate`, so its items are exactly timed.
#[test]
fn prefers_the_feeds_own_timestamp() {
    let items = parser::parse(ONLINE_KHABAR, NewsSource::OnlineKhabar, 100);
    let dated = items.iter().filter(|item| item.published.is_some()).count();
    assert!(dated > 0, "the feed publishes pubDate");
    assert!(
        items
            .iter()
            .filter(|item| item.published.is_some())
            .all(|item| item.precision == DatePrecision::Exact)
    );
}

/// The Kathmandu Post ships no `pubDate`, but every link spells the date out.
/// That is day-precise, which the item must record so the UI never renders it
/// as an hour-accurate time.
#[test]
fn falls_back_to_the_date_in_the_link_path() {
    let items = parser::parse(KATHMANDU_POST, NewsSource::KathmanduPost, 100);
    assert!(!items.is_empty());

    let dated: Vec<&NewsItem> = items
        .iter()
        .filter(|item| item.published.is_some())
        .collect();
    assert!(!dated.is_empty(), "links carry dates");
    assert!(
        dated
            .iter()
            .all(|item| item.precision == DatePrecision::Day),
        "a date read from a URL is only day-precise"
    );
}

/// The paper's day is a Nepali day, so a link date is midnight Nepal time —
/// 18:15 UTC the evening before, not 00:00 UTC.
#[test]
fn a_link_date_is_midnight_in_nepal_not_utc() {
    let date = parser::date_from_link_path("https://kathmandupost.com/national/2026/08/16/story")
        .expect("the path carries a date");
    let nepal = date.with_timezone(&sajilo_core::nepal_time::offset());
    assert_eq!(nepal.hour(), 0);
    assert_eq!(nepal.minute(), 0);
    assert_ne!(date.hour(), 0, "must not be midnight UTC");
}

#[test]
fn ignores_a_link_path_that_carries_no_usable_date() {
    assert!(parser::date_from_link_path("https://example.com/story").is_none());
    assert!(parser::date_from_link_path("https://example.com/2026/13/01/x").is_none());
    assert!(parser::date_from_link_path("https://example.com/2026/08/32/x").is_none());
    // A section numbered like a date must not be mistaken for one.
    assert!(parser::date_from_link_path("https://example.com/1200/08/16/x").is_none());
}

/// Feeds vary on whether seconds and the zone are present.
#[test]
fn reads_the_rfc_822_shapes_feeds_actually_send() {
    for raw in [
        "Sun, 16 Aug 2026 21:21:05 +0545",
        "Sun, 16 Aug 2026 21:21 +0545",
        "16 Aug 2026 21:21:05 +0545",
        "2026-08-16T21:21:05+05:45",
    ] {
        assert!(parser::parse_date(raw).is_some(), "{raw}");
    }
    assert!(parser::parse_date("").is_none());
    assert!(parser::parse_date("   ").is_none());
    assert!(parser::parse_date("last Tuesday").is_none());
}

/// Only ever hand the browser a web link.
#[test]
fn drops_an_item_with_no_usable_link_or_title() {
    let feed = r#"<rss><channel>
        <item><title>Fine</title><link>https://example.com/a</link></item>
        <item><title>Bad scheme</title><link>javascript:alert(1)</link></item>
        <item><title>Relative</title><link>/b</link></item>
        <item><title></title><link>https://example.com/c</link></item>
    </channel></rss>"#;
    let items = parser::parse(feed, NewsSource::Ratopati, 100);
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].link, "https://example.com/a");
}

/// A malformed tail still yields the items read before it — a dropped feed is
/// worse than a short one.
#[test]
fn survives_a_truncated_feed() {
    let feed = r#"<rss><channel>
        <item><title>One</title><link>https://example.com/a</link></item>
        <item><title>Two</title><link>https://exam"#;
    let items = parser::parse(feed, NewsSource::Ratopati, 100);
    assert_eq!(items.len(), 1);
}

#[test]
fn honours_the_limit() {
    assert_eq!(
        parser::parse(ONLINE_KHABAR, NewsSource::OnlineKhabar, 5).len(),
        5
    );
    assert!(parser::parse(ONLINE_KHABAR, NewsSource::OnlineKhabar, 0).is_empty());
}

// ---------------------------------------------------------------- merge

fn item(
    link: &str,
    source: NewsSource,
    published: Option<i64>,
    precision: DatePrecision,
) -> NewsItem {
    NewsItem {
        title: link.to_owned(),
        link: link.to_owned(),
        source,
        source_name: source.display_name().to_owned(),
        published: published.map(|secs| Utc.timestamp_opt(secs, 0).unwrap()),
        precision,
    }
}

/// Round-robin stops a single prolific feed — OnlineKhabar returns 55 items to
/// Bizkhabar's 10 — from filling the entire list.
#[test]
fn interleaves_one_headline_per_source_in_turn() {
    let prolific: Vec<NewsItem> = (0..10)
        .map(|i| {
            item(
                &format!("https://a/{i}"),
                NewsSource::OnlineKhabar,
                None,
                DatePrecision::Exact,
            )
        })
        .collect();
    let small = vec![item(
        "https://b/0",
        NewsSource::Bizkhabar,
        None,
        DatePrecision::Exact,
    )];

    let merged = rss::interleave(&[prolific, small], 6);
    assert_eq!(merged[0].link, "https://a/0");
    assert_eq!(
        merged[1].link, "https://b/0",
        "the small feed is not buried"
    );
    assert_eq!(merged.len(), 6);
}

/// The same wire story is syndicated to more than one of these sites.
#[test]
fn deduplicates_a_syndicated_story() {
    let one = vec![item(
        "https://shared/story",
        NewsSource::Ratopati,
        None,
        DatePrecision::Exact,
    )];
    let two = vec![item(
        "https://shared/story",
        NewsSource::Bizkhabar,
        None,
        DatePrecision::Exact,
    )];
    assert_eq!(rss::interleave(&[one, two], 10).len(), 1);
}

/// Only exactly-timed headlines are re-ranked. An undated or day-precise item
/// keeps the slot interleaving gave it, so no publisher is punished for the
/// shape of its feed.
#[test]
fn ranks_only_what_can_honestly_be_ranked() {
    let items = vec![
        item(
            "https://x/old",
            NewsSource::Ratopati,
            Some(1_000),
            DatePrecision::Exact,
        ),
        item(
            "https://x/undated",
            NewsSource::AnnapurnaPost,
            None,
            DatePrecision::Exact,
        ),
        item(
            "https://x/new",
            NewsSource::Bizkhabar,
            Some(9_000),
            DatePrecision::Exact,
        ),
        item(
            "https://x/dayonly",
            NewsSource::KathmanduPost,
            Some(5_000),
            DatePrecision::Day,
        ),
    ];
    let sorted = rss::newest_first(items);

    // Slots 0 and 2 held the rankable items; they are refilled newest-first.
    assert_eq!(sorted[0].link, "https://x/new");
    assert_eq!(sorted[2].link, "https://x/old");
    // The undated and day-precise items never moved.
    assert_eq!(sorted[1].link, "https://x/undated");
    assert_eq!(sorted[3].link, "https://x/dayonly");
}

/// Ties keep their interleaved order, so a refresh cannot shuffle
/// equally-timed headlines.
#[test]
fn the_sort_is_stable_on_ties() {
    let items = vec![
        item(
            "https://x/a",
            NewsSource::Ratopati,
            Some(5_000),
            DatePrecision::Exact,
        ),
        item(
            "https://x/b",
            NewsSource::Bizkhabar,
            Some(5_000),
            DatePrecision::Exact,
        ),
        item(
            "https://x/c",
            NewsSource::Khabarhub,
            Some(5_000),
            DatePrecision::Exact,
        ),
    ];
    let sorted = rss::newest_first(items.clone());
    assert_eq!(
        sorted.iter().map(|i| i.link.as_str()).collect::<Vec<_>>(),
        ["https://x/a", "https://x/b", "https://x/c"]
    );
    // And it is idempotent.
    assert_eq!(rss::newest_first(sorted.clone()), sorted);
}

/// Every feed URL is real and distinct, no source claims another's, and
/// Kantipur — the one source with no feed at all — lists none.
#[test]
fn every_source_has_a_distinct_feed_url() {
    let mut urls: Vec<&str> = NewsSource::ALL
        .iter()
        .flat_map(|s| s.rss_feeds().iter().copied())
        .collect();
    let count = urls.len();
    urls.sort_unstable();
    urls.dedup();
    assert_eq!(urls.len(), count, "two sources share a feed URL");
    assert!(urls.iter().all(|url| url.starts_with("https://")));
    assert!(NewsSource::Kantipur.rss_feeds().is_empty());
    // Only The Kathmandu Post is dated from its link path.
    assert_eq!(
        NewsSource::ALL
            .iter()
            .filter(|s| s.dates_from_link_path())
            .count(),
        1
    );
}

/// Some feeds escape HTML entities *inside* CDATA, which an XML parser is
/// right to leave alone. Decoding them is this parser's job, or
/// `Three-year-old&#039;s` reaches the reader exactly as written.
#[test]
fn decodes_entities_left_inside_cdata() {
    assert!(
        ENTITIES_IN_CDATA.contains("&#039;"),
        "the fixture should still hold the escapes this test is about"
    );
    let items = parser::parse(ENTITIES_IN_CDATA, NewsSource::Ratopati, 100);
    assert_eq!(items.len(), 50);
    assert!(
        items.iter().any(|item| item.title.contains('\'')),
        "the escaped apostrophes should have become real ones"
    );
    assert!(
        !items.iter().any(|item| item.title.contains("&#")),
        "no escape should survive into a headline"
    );
}

/// A stray ampersand is not an entity, and an already-escaped escape decodes
/// exactly once.
#[test]
fn decodes_each_escape_only_once() {
    let feed = |title: &str| {
        format!(
            "<rss><channel><item><title><![CDATA[{title}]]></title>\
             <link>https://example.com/a</link></item></channel></rss>"
        )
    };
    let title = |raw: &str| {
        parser::parse(&feed(raw), NewsSource::Ratopati, 1)
            .first()
            .map(|item| item.title.clone())
            .unwrap_or_default()
    };

    assert_eq!(title("Fish &amp; chips"), "Fish & chips");
    assert_eq!(title("&amp;lt;tag&amp;gt;"), "&lt;tag&gt;");
    assert_eq!(title("Rs 5 &amp; up"), "Rs 5 & up");
    assert_eq!(title("Q&A on tax"), "Q&A on tax");
    assert_eq!(title("&#x27;quoted&#x27;"), "'quoted'");
    assert_eq!(title("&notarealentity; here"), "&notarealentity; here");
}
