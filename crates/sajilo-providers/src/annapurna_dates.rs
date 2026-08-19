//! Recovers a publish time for Annapurna Post, whose feed ships none. Ported
//! from `ArticleDateResolver.swift`.
//!
//! Annapurna Post's RSS carries only `title`, `link`, `description`, and
//! `guid` — no `pubDate`, no `dc:date`, no Atom `published`. The date is not
//! missing from their newsroom, only from the feed: every story page prints
//! it, in Bikram Sambat with Devanagari numerals.
//!
//! ```text
//! साउन ३१, २०८३ आइतबार २१:२१:५
//! ```
//!
//! **This fetches article pages, not a feed**, which is a heavier thing to do
//! to a publisher than reading their syndication. Two limits keep it
//! proportionate, and both are the caller's job: a page is fetched at most
//! once ever, and only a bounded number are fetched per refresh.

use chrono::{DateTime, NaiveDateTime, NaiveTime, TimeZone, Utc};
use regex::Regex;
use sajilo_core::nepal_time;
use sajilo_core::{NepaliDate, NepaliMonth, calendar::bikram_sambat};
use std::sync::LazyLock;

use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "Annapurna Post article";

/// `साउन ३१, २०८३ आइतबार २१:२१:५` — note the seconds run to a single digit,
/// so nothing here assumes two.
static TIMESTAMP_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    let months = NepaliMonth::all()
        .iter()
        .map(|month| month.nepali_name())
        .collect::<Vec<_>>()
        .join("|");
    let digit = "[\u{0966}-\u{096F}]";
    Regex::new(&format!(
        r"({months})\s*({digit}{{1,2}}),?\s*({digit}{{4}})\s*\S*\s*({digit}{{1,2}}):({digit}{{1,2}})(?::{digit}{{1,2}})?"
    ))
    .expect("static pattern is valid")
});

/// Fetches the article page and reads its timestamp. `None` on any transport
/// failure, non-2xx status, or a page that carries no recognisable stamp —
/// this never blocks a headline on one newsroom's page being unreachable.
pub async fn resolve(client: &HttpClient, link: &str) -> Option<DateTime<Utc>> {
    let html = client.get_text(SOURCE_NAME, link).await.ok()?;
    published_date_in(&html)
}

/// The story page also carries today's date in the site header, in a
/// different order and with no clock — `३१ साउन २०८३, आइतबार`. Requiring a
/// time is what separates the article's own stamp from that furniture, so a
/// story never gets dated "today" just because the page was rendered today.
pub fn published_date_in(html: &str) -> Option<DateTime<Utc>> {
    let text = plain_text(html);
    let captures = TIMESTAMP_PATTERN.captures(&text)?;

    let month = NepaliMonth::from_nepali_name(&captures[1])?;
    let day: u32 = to_ascii_digits(&captures[2]).parse().ok()?;
    let year: i32 = to_ascii_digits(&captures[3]).parse().ok()?;
    let hour: u32 = to_ascii_digits(&captures[4]).parse().ok()?;
    let minute: u32 = to_ascii_digits(&captures[5]).parse().ok()?;

    let nepali_date = NepaliDate::new(year, month.number(), day);
    let midnight = bikram_sambat::gregorian_date_from(nepali_date).ok()?;

    // The clock on the page is Nepal local time.
    let time = NaiveTime::from_hms_opt(hour.min(23), minute.min(59), 0)?;
    let local = nepal_time::offset()
        .from_local_datetime(&NaiveDateTime::new(midnight, time))
        .single()?;
    Some(local.with_timezone(&Utc))
}

fn to_ascii_digits(devanagari: &str) -> String {
    devanagari
        .chars()
        .map(|c| match c {
            '\u{0966}'..='\u{096F}' => {
                char::from_digit(c as u32 - '\u{0966}' as u32, 10).unwrap_or(c)
            }
            other => other,
        })
        .collect()
}

fn plain_text(html: &str) -> String {
    let mut output = String::new();
    let mut inside_tag = false;
    for character in html.chars() {
        match character {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            _ if !inside_tag => output.push(character),
            _ => {}
        }
    }
    output.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The story page prints the article's stamp with a clock, and the site
    /// header prints today's date without one, in a different word order.
    const PAGE: &str = r#"<html><body>
      <header><span>३१ साउन २०८३, आइतबार</span></header>
      <h1>पहिरोको उच्च जोखिममा रोल्पाका बस्ती</h1>
      <div class="time">साउन ३१, २०८३ आइतबार २१:२१:५</div>
      <p>काठमाडौं : समाचार…</p>
    </body></html>"#;

    /// BS साउन ३१, २०८३ is AD 2026-08-16.
    #[test]
    fn reads_the_bikram_sambat_stamp() {
        let date = published_date_in(PAGE).unwrap();
        let local = date.with_timezone(&nepal_time::offset());
        use chrono::{Datelike, Timelike};
        assert_eq!(local.year(), 2026);
        assert_eq!(local.month(), 8);
        assert_eq!(local.day(), 16);
        assert_eq!(local.hour(), 21);
        assert_eq!(local.minute(), 21);
    }

    /// The header carries today's date with no clock. Matching it would stamp
    /// every article with the day it was fetched — which looks right and is
    /// wrong, the worst combination.
    #[test]
    fn ignores_the_undated_site_header() {
        let header_only =
            "<header><span>३१ साउन २०८३, आइतबार</span></header><p>no article stamp</p>";
        assert!(published_date_in(header_only).is_none());

        use chrono::Timelike;
        let date = published_date_in(PAGE).unwrap();
        assert_eq!(date.with_timezone(&nepal_time::offset()).hour(), 21);
    }

    /// Seconds run to a single digit on the real page — "२१:२१:५".
    #[test]
    fn tolerates_the_stamps_loose_formatting() {
        use chrono::Timelike;
        for stamp in [
            "साउन ३१, २०८३ आइतबार २१:२१:५",
            "साउन ३१, २०८३ आइतबार २१:२१:०५",
            "साउन ३१, २०८३ आइतबार २१:२१",
            "साउन ३१,२०८३ आइतबार २१:२१:५",
        ] {
            let html = format!("<div>{stamp}</div>");
            let date = published_date_in(&html).unwrap_or_else(|| panic!("no match for {stamp}"));
            assert_eq!(
                date.with_timezone(&nepal_time::offset()).hour(),
                21,
                "{stamp}"
            );
        }
    }

    #[test]
    fn returns_nothing_rather_than_guessing() {
        for html in [
            "<p>no date here at all</p>",
            "<p>साउन ३१, २०८३ आइतबार</p>",
            "<p>Sunday, August 16, 2026 21:21</p>",
            "<p>फोओ ३१, २०८३ आइतबार २१:२१:५</p>",
        ] {
            assert!(published_date_in(html).is_none(), "{html}");
        }
    }

    /// A year outside the bundled month-length table cannot be converted, and
    /// must fail rather than land on a fabricated day.
    #[test]
    fn rejects_an_unconvertible_year() {
        assert!(published_date_in("<p>साउन ३१, २९९९ आइतबार २१:२१:५</p>").is_none());
    }
}
