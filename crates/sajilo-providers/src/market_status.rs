//! Whether NEPSE is trading right now, as the exchange itself reports it.
//!
//! A clock-and-calendar guess would miss the closures that matter most — a
//! holiday declared the day before, a festival the bundled calendar marks
//! differently, a trading halt — so this reads NEPSE's own open/closed flag.
//! `nepalstock.com` guards that endpoint behind a rotating token, so it is read
//! through ShareHub, which relays the payload unchanged, with ShareSansar's
//! live-trading board as the fallback. When neither gives an explicit answer
//! the status is `None` and the UI leaves it out rather than guessing.

use chrono::{DateTime, NaiveDateTime, Utc};
use sajilo_api::stocks::MarketStatus;
use sajilo_core::nepal_time;
use scraper::{Html, Selector};
use serde::Deserialize;

use crate::http::HttpClient;
use crate::sharesansar;

pub const SHAREHUB_SOURCE: &str = "ShareHub";

const SHAREHUB_URL: &str = "https://sharehubnepal.com/live/api/v2/nepselive/market-status";
const LIVE_TRADING_URL: &str = "https://www.sharesansar.com/live-trading";

pub async fn fetch(client: &HttpClient) -> Option<MarketStatus> {
    let relayed = client.get_text(SHAREHUB_SOURCE, SHAREHUB_URL).await.ok();
    if let Some(status) = relayed.as_deref().and_then(parse_sharehub) {
        return Some(status);
    }
    // The fallback page is ~850 KB, so it is fetched only when the small
    // payload above failed or said something unrecognised.
    client
        .get_text(sharesansar::SOURCE_NAME, LIVE_TRADING_URL)
        .await
        .ok()
        .as_deref()
        .and_then(parse_live_trading)
}

/// NEPSE's `market-open` payload:
/// `{"isOpen":"CLOSE","asOf":"2026-09-14T15:00:00","id":80}`. `isOpen` is a
/// word rather than a boolean, so anything but the two known words counts as
/// no answer. `asOf` is when the exchange last changed state, in Nepal time
/// without an offset.
pub fn parse_sharehub(body: &str) -> Option<MarketStatus> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Response {
        is_open: String,
        as_of: Option<String>,
    }

    let response: Response = serde_json::from_str(body).ok()?;
    status(&response.is_open, response.as_of.as_deref())
}

/// ShareSansar's live-trading board: a status button reading "Market Closed"
/// after hours, and an `As of` stamp for the board's last update beside it.
pub fn parse_live_trading(html: &str) -> Option<MarketStatus> {
    let document = Html::parse_document(html);
    let button = Selector::parse("#menu button").expect("static selector");
    let stamp = Selector::parse("#dDate").expect("static selector");
    let as_of = document
        .select(&stamp)
        .next()
        .map(|element| element.text().collect::<String>());

    document.select(&button).find_map(|button| {
        let words: Vec<String> = button
            .text()
            .flat_map(str::split_whitespace)
            .map(str::to_ascii_lowercase)
            .collect();
        match words.as_slice() {
            [market, word] if market == "market" => status(word, as_of.as_deref()),
            _ => None,
        }
    })
}

fn status(word: &str, as_of: Option<&str>) -> Option<MarketStatus> {
    let is_open = match word.trim().to_ascii_uppercase().as_str() {
        "OPEN" => true,
        "CLOSE" | "CLOSED" => false,
        _ => return None,
    };
    Some(MarketStatus {
        is_open,
        as_of: as_of.and_then(nepal_instant),
    })
}

/// `2026-09-14T15:00:00` or `2026-09-14 15:00:00`, read as Kathmandu wall-clock
/// time. A stamp that does not parse is dropped; the status still stands.
fn nepal_instant(raw: &str) -> Option<DateTime<Utc>> {
    let normalized = raw.trim().get(..19)?.replacen(' ', "T", 1);
    NaiveDateTime::parse_from_str(&normalized, "%Y-%m-%dT%H:%M:%S")
        .ok()?
        .and_local_timezone(nepal_time::offset())
        .single()
        .map(|instant| instant.with_timezone(&Utc))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 15:00 in Kathmandu, the recorded close.
    fn recorded_close() -> Option<DateTime<Utc>> {
        "2026-09-14T09:15:00Z".parse().ok()
    }

    #[test]
    fn reads_the_relayed_exchange_flag() {
        let body = include_str!("../../../fixtures/sharehub/market-status.json");
        let status = parse_sharehub(body).unwrap();
        assert!(!status.is_open);
        assert_eq!(status.as_of, recorded_close());
        assert!(
            parse_sharehub(r#"{"isOpen":"OPEN","asOf":"2026-09-15T11:00:00","id":81}"#)
                .is_some_and(|status| status.is_open)
        );
        assert!(
            parse_sharehub(r#"{"isOpen":"OPEN","asOf":"soon"}"#)
                .is_some_and(|status| status.is_open && status.as_of.is_none())
        );
    }

    #[test]
    fn ignores_a_flag_it_does_not_recognise() {
        assert!(parse_sharehub(r#"{"isOpen":"PRE-OPEN"}"#).is_none());
        assert!(parse_sharehub("{}").is_none());
    }

    #[test]
    fn reads_the_live_trading_button() {
        let html = include_str!("../../../fixtures/sharesansar/live-trading.html");
        let status = parse_live_trading(html).unwrap();
        assert!(!status.is_open);
        assert_eq!(status.as_of, recorded_close());
        assert!(
            parse_live_trading(r#"<ul id="menu"><li><button>Market Open</button></li></ul>"#)
                .is_some_and(|status| status.is_open)
        );
        assert!(parse_live_trading("<p>Market Open</p>").is_none());
    }
}
