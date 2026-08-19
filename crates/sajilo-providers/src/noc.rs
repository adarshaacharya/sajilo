//! Nepal Oil Corporation, the state importer that sets every retail fuel price
//! in the country. Ported from `NOCFuelProvider.swift`.
//!
//! NOC publishes no API, only a server-rendered price history table. That table
//! is the primary source rather than a mirror of one, and it is read the way a
//! reader would: find the heading row, then take the two most recent revisions.
//! Column *positions* are never assumed — headings are matched by name, so NOC
//! inserting a column cannot silently shift diesel into the kerosene slot.

use std::collections::HashMap;

use chrono::{DateTime, NaiveDate, Utc};
use sajilo_api::bazar::{Fuel, FuelPrice, FuelPriceSnapshot};
use sajilo_api::load_state::Freshness;

use crate::error::{ProviderError, Result};
use crate::html;
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "NOC fuel";

pub const ENDPOINT: &str = "https://noc.org.np/retailprice";

pub async fn fetch(client: &HttpClient, now: DateTime<Utc>) -> Result<FuelPriceSnapshot> {
    let body = client.get_text(SOURCE_NAME, ENDPOINT).await?;
    parse(&body, now)
}

pub fn parse(page: &str, now: DateTime<Utc>) -> Result<FuelPriceSnapshot> {
    // Selected by heading rather than position, so another table appearing
    // above this one on the page does not break the read.
    let rows = html::table_with_headings(page, &["petrol", "diesel"])
        .filter(|rows| rows.len() >= 2)
        .ok_or_else(|| ProviderError::parse(SOURCE_NAME, "no price table on the page"))?;

    let columns = column_indices(&rows[0]);
    if columns.is_empty() {
        return Err(ProviderError::parse(
            SOURCE_NAME,
            "the table carries no recognisable fuel column",
        ));
    }

    // Newest revision first, which is how NOC orders the table. The row under
    // it is the revision it replaced, giving the change figure.
    let current = &rows[1];
    let previous = rows.get(2).unwrap_or(current);

    let prices: Vec<FuelPrice> = Fuel::ALL
        .into_iter()
        .filter_map(|fuel| {
            let column = *columns.get(&fuel)?;
            let price = amount(current, column)?;
            Some(FuelPrice {
                fuel,
                price,
                // A first-ever revision has nothing before it; treating the
                // price as its own predecessor reports "no change" rather than
                // a fabricated swing from zero.
                previous_price: amount(previous, column).unwrap_or(price),
            })
        })
        .collect();

    if prices.is_empty() {
        return Err(ProviderError::parse(
            SOURCE_NAME,
            "no fuel price could be read from the newest revision",
        ));
    }

    let effective_from = current
        .first()
        .and_then(|cell| effective_date(cell))
        .unwrap_or_else(|| now.date_naive());

    Ok(FuelPriceSnapshot {
        prices,
        effective_from,
        freshness: Freshness::new(now),
    })
}

fn column_indices(heading: &[String]) -> HashMap<Fuel, usize> {
    let mut indices = HashMap::new();
    for (index, cell) in heading.iter().enumerate() {
        let name = cell.to_lowercase();
        for fuel in Fuel::ALL {
            if name.contains(fuel.column_heading()) {
                // First column wins: NOC has never repeated a heading, and
                // taking a later one would silently prefer a stray match.
                indices.entry(fuel).or_insert(index);
            }
        }
    }
    indices
}

fn amount(row: &[String], index: usize) -> Option<f64> {
    let value = html::parse_number(row.get(index)?)?;
    (value > 0.0).then_some(value)
}

/// The effective-date cell pairs a Bikram Sambat date with the AD one in
/// brackets, and NOC has typed it several ways over the years —
/// `2083.04.17(2026.08.02)`, `2083.03.16 (2026.06.30)`. The AD date inside the
/// brackets is the part that parses unambiguously, so this takes that and
/// tolerates whichever separators surround it.
pub fn effective_date(cell: &str) -> Option<NaiveDate> {
    let open = cell.find('(')?;
    let close = cell.find(')')?;
    if close <= open {
        return None;
    }

    let parts: Vec<&str> = cell[open + 1..close]
        .split(['.', '-', '/'])
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect();
    if parts.len() != 3 {
        return None;
    }

    let year: i32 = parts[0].parse().ok()?;
    let month: u32 = parts[1].parse().ok()?;
    let day: u32 = parts[2].parse().ok()?;
    // The bracketed date is the Gregorian one by NOC's own convention — a BS
    // year cannot be told apart from an AD one numerically (BS 2083 and AD 2083
    // are the same integer), so this only rejects years no calendar would use.
    if year <= 1900 {
        return None;
    }
    NaiveDate::from_ymd_opt(year, month, day)
}
