//! Upcoming dividend book closures, from ShareHub's dividend list.
//!
//! A declared dividend matters to a holder until its book closure: whoever
//! holds the share on that day receives it. ShareHub lists declarations newest
//! first, and a closure falls within a few weeks of its announcement, so the
//! latest fifty cover every closure still ahead with a wide margin.

use chrono::{DateTime, NaiveDate, Utc};
use sajilo_api::dividends::{BookClosure, DividendSnapshot};
use sajilo_api::load_state::Freshness;
use sajilo_core::nepal_time;
use serde::Deserialize;

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;
use crate::market_status::SHAREHUB_SOURCE as SOURCE_NAME;

const DIVIDENDS_URL: &str = "https://sharehubnepal.com/data/api/v1/dividend?size=50&page=1";

pub async fn fetch(client: &HttpClient, now: DateTime<Utc>) -> Result<DividendSnapshot> {
    let body = client.get_text(SOURCE_NAME, DIVIDENDS_URL).await?;
    parse(&body, now)
}

// The upstream payload, modelled separately from the DTO so a ShareHub field
// rename cannot reach into the contract the app is built on.
#[derive(Deserialize)]
struct Response {
    data: Page,
}

#[derive(Deserialize)]
struct Page {
    content: Vec<Entry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    symbol: Option<String>,
    name: Option<String>,
    bonus: Option<f64>,
    cash: Option<f64>,
    book_closure_date: Option<String>,
    fiscal_year: Option<String>,
}

/// Declarations without a book closure yet, or whose closure has passed, are
/// dropped: neither gives a holder anything to act on.
pub fn parse(body: &str, now: DateTime<Utc>) -> Result<DividendSnapshot> {
    let response: Response = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(SOURCE_NAME, error.to_string()))?;
    let today = now.with_timezone(&nepal_time::offset()).date_naive();

    let mut closures: Vec<BookClosure> = response
        .data
        .content
        .into_iter()
        .filter_map(|entry| {
            let date = entry
                .book_closure_date
                .as_deref()
                .and_then(|raw| NaiveDate::parse_from_str(raw.get(..10)?, "%Y-%m-%d").ok())?;
            if date < today {
                return None;
            }
            let symbol = entry.symbol?.trim().to_ascii_uppercase();
            let bonus_percent = entry.bonus.unwrap_or(0.0).max(0.0);
            let cash_percent = entry.cash.unwrap_or(0.0).max(0.0);
            if symbol.is_empty() || bonus_percent + cash_percent <= 0.0 {
                return None;
            }
            Some(BookClosure {
                symbol,
                company_name: entry
                    .name
                    .map(|name| name.trim().to_owned())
                    .unwrap_or_default(),
                bonus_percent,
                cash_percent,
                book_closure_date: date.to_string(),
                fiscal_year: entry.fiscal_year,
            })
        })
        .collect();

    closures.sort_by(|a, b| {
        a.book_closure_date
            .cmp(&b.book_closure_date)
            .then_with(|| a.symbol.cmp(&b.symbol))
    });

    Ok(DividendSnapshot {
        closures,
        freshness: Freshness::new(now),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const RECORDED: &str = include_str!("../../../fixtures/sharehub/dividends.json");

    fn at(instant: &str) -> DateTime<Utc> {
        instant.parse().unwrap()
    }

    #[test]
    fn keeps_only_closures_still_ahead_soonest_first() {
        let snapshot = parse(RECORDED, at("2026-09-14T06:00:00Z")).unwrap();
        assert_eq!(snapshot.closures.len(), 13);
        let first = &snapshot.closures[0];
        assert_eq!(first.symbol, "EBL");
        assert_eq!(first.book_closure_date, "2026-09-17");
        assert_eq!(first.bonus_percent, 5.0);
        assert_eq!(first.cash_percent, 10.0);
        assert!(
            snapshot
                .closures
                .windows(2)
                .all(|pair| pair[0].book_closure_date <= pair[1].book_closure_date)
        );
    }

    #[test]
    fn a_closure_counts_as_ahead_through_its_own_nepal_day() {
        // 00:30 UTC on the 22nd is already 06:15 on the 22nd in Kathmandu.
        let snapshot = parse(RECORDED, at("2026-09-22T00:30:00Z")).unwrap();
        assert_eq!(snapshot.closures.len(), 8);
        assert_eq!(snapshot.closures[0].symbol, "H8020");
    }

    #[test]
    fn drops_declarations_with_nothing_to_pay() {
        let body = r#"{"data":{"content":[
            {"symbol":"NONE","name":"x","bonus":0,"cash":0,"bookClosureDate":"2026-10-01T00:00:00"},
            {"symbol":"TBD","name":"y","bonus":5,"cash":0,"bookClosureDate":null}
        ]}}"#;
        assert!(
            parse(body, at("2026-09-14T06:00:00Z"))
                .unwrap()
                .closures
                .is_empty()
        );
    }

    #[test]
    fn rejects_a_response_that_is_not_the_dividend_list() {
        assert!(parse("<html></html>", at("2026-09-14T06:00:00Z")).is_err());
    }
}
