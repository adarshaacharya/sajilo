//! A company's fundamentals from Merolagani's company page: EPS, P/E, book
//! value, dividends and the rest, the figures NEPSE investors look for first.
//!
//! The page is a table of `<th>` labels and `<td>` values. Rows are found by
//! their label rather than their position, so a row Merolagani adds or moves
//! doesn't shift the others, and a row that's missing is simply `None`.

use chrono::{DateTime, Utc};
use sajilo_api::load_state::Freshness;
use sajilo_api::stocks::{ReportedFigure, StockFundamentals};
use scraper::{ElementRef, Html, Node, Selector};

use crate::error::{ProviderError, Result};
use crate::html::parse_number;
use crate::http::HttpClient;

pub const SOURCE: &str = "Merolagani";
const COMPANY_URL: &str = "https://merolagani.com/CompanyDetail.aspx";

pub async fn fetch(
    client: &HttpClient,
    symbol: &str,
    now: DateTime<Utc>,
) -> Result<StockFundamentals> {
    let body = client
        .get_text(SOURCE, &format!("{COMPANY_URL}?symbol={symbol}"))
        .await?;
    parse(&body, symbol, now)
}

/// A cell's own words, without those of any table nested inside it (the
/// dividend rows carry a history table of their own).
fn own_text(element: ElementRef) -> String {
    let mut text = String::new();
    for child in element.children() {
        match child.value() {
            Node::Text(words) => text.push_str(words),
            Node::Element(inner) if inner.name() != "table" => {
                if let Some(inner) = ElementRef::wrap(child) {
                    text.push_str(&own_text(inner));
                }
            }
            _ => {}
        }
    }
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// `10.81 (FY:082-083, Q:4)` → 10.81, `FY 082/83 · Q4`.
fn reported(raw: &str) -> Option<ReportedFigure> {
    let (number, rest) = raw.split_once('(').unwrap_or((raw, ""));
    let value = parse_number(number.trim().trim_end_matches('%'))?;
    let inside = rest.trim_end_matches(')').replace(' ', "");
    let year = inside
        .split(',')
        .find_map(|part| part.strip_prefix("FY:"))
        .map(|year| format!("FY {}", year.replace('-', "/").replacen("/0", "/", 1)));
    let quarter = inside
        .split(',')
        .find_map(|part| part.strip_prefix("Q:"))
        .map(|quarter| format!("Q{quarter}"));
    let period = [year, quarter]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" · ");
    Some(ReportedFigure { value, period })
}

fn number(raw: &str) -> Option<f64> {
    parse_number(raw.trim().trim_end_matches('%').trim())
}

pub fn parse(body: &str, symbol: &str, now: DateTime<Utc>) -> Result<StockFundamentals> {
    let document = Html::parse_document(body);
    let rows =
        Selector::parse("tr").map_err(|error| ProviderError::parse(SOURCE, error.to_string()))?;
    let mut table: Vec<(String, String)> = Vec::new();
    for row in document.select(&rows) {
        let cells: Vec<ElementRef> = row.children().filter_map(ElementRef::wrap).collect();
        let label = cells.iter().find(|cell| cell.value().name() == "th");
        let value = cells.iter().find(|cell| cell.value().name() == "td");
        if let (Some(label), Some(value)) = (label, value) {
            table.push((own_text(*label), own_text(*value)));
        }
    }
    let get = |label: &str| {
        table
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(label))
            .map(|(_, value)| value.as_str())
            .filter(|value| !value.is_empty())
    };
    // A page for a symbol Merolagani doesn't know has none of the rows.
    if get("Market Price").is_none() && get("EPS").is_none() {
        return Err(ProviderError::parse(
            SOURCE,
            format!("no company page for {symbol}"),
        ));
    }
    Ok(StockFundamentals {
        symbol: symbol.to_owned(),
        sector: get("Sector").map(str::to_owned),
        shares_outstanding: get("Shares Outstanding").and_then(number),
        market_cap: get("Market Capitalization").and_then(number),
        eps: get("EPS").and_then(reported),
        pe_ratio: get("P/E Ratio").and_then(number),
        book_value: get("Book Value").and_then(number),
        pbv: get("PBV").and_then(number),
        cash_dividend: get("% Dividend").and_then(reported),
        bonus_share: get("% Bonus").and_then(reported),
        right_share: get("Right Share").map(str::to_owned),
        one_year_yield: get("1 Year Yield").and_then(number),
        average_volume_30_day: get("30-Day Avg Volume").and_then(number),
        paid_up_value: get("Paidup Value").and_then(number),
        source: SOURCE.to_owned(),
        freshness: Freshness::new(now),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const BHCL: &str = include_str!("../../../fixtures/merolagani/company-BHCL.html");

    fn now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-10-01T06:00:00Z")
            .unwrap()
            .with_timezone(&Utc)
    }

    #[test]
    fn reads_the_company_page() {
        let f = parse(BHCL, "BHCL", now()).unwrap();
        assert_eq!(f.sector.as_deref(), Some("Hydro Power"));
        let eps = f.eps.unwrap();
        assert!((eps.value - 10.81).abs() < 1e-9);
        assert_eq!(eps.period, "FY 082/83 · Q4");
        assert_eq!(f.pe_ratio, Some(52.73));
        assert_eq!(f.book_value, Some(112.53));
        assert_eq!(f.pbv, Some(5.07));
        assert_eq!(f.market_cap, Some(5_181_877_410.0));
        assert_eq!(f.shares_outstanding, Some(9_091_013.0));
        assert_eq!(f.one_year_yield, Some(24.18));
        assert_eq!(f.average_volume_30_day, Some(52_143.0));
        assert_eq!(f.paid_up_value, Some(100.0));
        let bonus = f.bonus_share.unwrap();
        assert_eq!((bonus.value, bonus.period.as_str()), (10.0, "FY 082/83"));
        assert_eq!(f.cash_dividend.map(|d| d.value), Some(0.53));
        assert_eq!(f.right_share, None, "none given");
    }

    #[test]
    fn a_page_without_a_company_is_an_error() {
        assert!(parse("<html><body>Not found</body></html>", "NOPE", now()).is_err());
    }
}
