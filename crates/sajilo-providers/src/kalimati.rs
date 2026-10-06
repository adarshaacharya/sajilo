//! The Kalimati market board's daily wholesale produce rates. Ported from
//! `KalimatiMarketProvider.swift`.
//!
//! These are **wholesale** rates — the number the papers quote each morning,
//! not what a neighbourhood stall charges. The board publishes no API, and
//! every figure on it is typed by hand, so the parser tolerates spelling and
//! punctuation drift and drops a row it cannot read rather than guessing.

use chrono::{DateTime, Utc};
use sajilo_api::bazar::{MarketUnit, VegetableMarketSnapshot, VegetablePrice};
use sajilo_api::load_state::Freshness;
use sajilo_core::calendar::bikram_sambat::is_supported_year;
use sajilo_core::calendar::nepali_date::NepaliMonth;
use sajilo_core::{NepaliDate, numerals};

use crate::error::{ProviderError, Result};
use crate::html;
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "Kalimati market";

pub const ENDPOINT: &str = "https://kalimatimarket.gov.np/price";

pub async fn fetch(client: &HttpClient, now: DateTime<Utc>) -> Result<VegetableMarketSnapshot> {
    let body = client.get_text(SOURCE_NAME, ENDPOINT).await?;
    parse(&body, now)
}

pub fn parse(page: &str, now: DateTime<Utc>) -> Result<VegetableMarketSnapshot> {
    let rows = html::first_table(page);
    if rows.len() < 2 {
        return Err(ProviderError::parse(
            SOURCE_NAME,
            "no price table on the page",
        ));
    }

    let prices: Vec<VegetablePrice> = rows.iter().skip(1).filter_map(|row| price(row)).collect();
    if prices.is_empty() {
        return Err(ProviderError::parse(
            SOURCE_NAME,
            "the table carried no readable price row",
        ));
    }

    Ok(VegetableMarketSnapshot {
        prices,
        published_on: published_date(page),
        freshness: Freshness::new(now),
    })
}

/// Columns are `कृषि उपज | ईकाइ | न्यूनतम | अधिकतम | औसत`. Unlike NOC's table
/// these headings are not machine-friendly labels and the board has kept the
/// same five for years, so position is used — but a row that does not yield a
/// name, a unit and three amounts is dropped rather than guessed at, which is
/// what would catch a reordering.
fn price(row: &[String]) -> Option<VegetablePrice> {
    if row.len() < 5 {
        return None;
    }

    let name = row[0].trim();
    if name.is_empty() {
        return None;
    }

    Some(VegetablePrice {
        name: name.to_owned(),
        unit: MarketUnit::parse(&row[1])?,
        minimum: amount(&row[2])?,
        maximum: amount(&row[3])?,
        average: amount(&row[4])?,
        english_name: english_name(name),
    })
}

/// `रू १,०००.००` → 1000. The digits arrive in Devanagari, so they are
/// transliterated before anything tries to read them as a number.
fn amount(raw: &str) -> Option<f64> {
    let value = html::parse_number(raw)?;
    (value > 0.0).then_some(value)
}

/// The board stamps the table with a heading like `- वि.सं. साउन ३१, २०८३`.
///
/// Read out of the page rather than assumed to be today: the board does not
/// publish on every holiday, so the rates on screen are sometimes the previous
/// trading day's and should say so.
pub fn published_date(page: &str) -> Option<NepaliDate> {
    const MARKER: &str = "वि.सं.";
    let start = page.find(MARKER)? + MARKER.len();
    // Enough of the page to cover the date and nothing beyond it.
    let window: String = page[start..].chars().take(60).collect();

    let month = (1..=12).find(|&month| {
        NepaliMonth::from_number(month).is_some_and(|m| window.contains(m.nepali_name()))
    })?;

    let numbers: Vec<u32> = numerals::to_ascii_digits(&window)
        .split(|c: char| !c.is_ascii_digit())
        .filter_map(|part| part.parse().ok())
        .collect();

    // Day then year, in that order: "साउन ३१, २०८३".
    let (&day, &year) = (numbers.first()?, numbers.get(1)?);
    let year = year as i32;
    if !(1..=32).contains(&day) || !is_supported_year(year) {
        return None;
    }

    Some(NepaliDate::new(year, month, day))
}

/// English names for Kalimati's produce list.
///
/// Deliberately partial. Every entry is a name the item is actually sold under
/// in English; anything uncertain is left out and the UI falls back to the
/// Nepali name. A wrong label on a price list is worse than no label — someone
/// buys the wrong thing.
///
/// Matched longest-first, because the names nest: "भेडे खुर्सानी" is capsicum
/// while "खुर्सानी" is chilli, and checking the short one first would file
/// every capsicum as a chilli.
///
/// The list is the `kalimati` config pack (`data/config/kalimati.json`), so
/// a new item on the board gets its English name without a release.
pub fn english_name(name: &str) -> Option<String> {
    sajilo_core::config::kalimati::english_name(name)
}
