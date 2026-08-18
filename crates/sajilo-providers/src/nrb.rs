//! Nepal Rastra Bank exchange rates — the official source, which is why
//! PRD §5.5 names it rather than an aggregator. Ported from
//! `NRBForexProvider.swift`.

use std::collections::BTreeMap;

use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, TimeZone, Utc};
use sajilo_api::forex::{ForexRate, ForexSnapshot};
use sajilo_api::load_state::Freshness;
use serde::Deserialize;

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "NRB forex";

/// A window rather than a single day: NRB does not publish on every date, and
/// asking for just today would return an empty payload on those days instead of
/// the rates still in force.
const LOOKBACK_DAYS: i64 = 7;

pub fn request_url(today: NaiveDate) -> String {
    let start = today - Duration::days(LOOKBACK_DAYS);
    format!("https://www.nrb.org.np/api/forex/v1/rates?page=1&per_page=100&from={start}&to={today}")
}

pub async fn fetch(
    client: &HttpClient,
    today: NaiveDate,
    now: DateTime<Utc>,
) -> Result<ForexSnapshot> {
    let body = client.get_text(SOURCE_NAME, &request_url(today)).await?;
    parse(&body, now)
}

// The upstream payload, modelled separately from the DTO so an NRB field
// rename cannot reach into the contract the app is built on.
#[derive(Deserialize)]
struct Response {
    data: Payload,
}

#[derive(Deserialize)]
struct Payload {
    payload: Vec<Day>,
}

#[derive(Deserialize)]
struct Day {
    date: String,
    published_on: Option<String>,
    modified_on: Option<String>,
    rates: Vec<Rate>,
}

#[derive(Deserialize)]
struct Rate {
    currency: Currency,
    // NRB sends these as strings, and has shipped an empty one for a currency
    // it did not quote that day.
    buy: String,
    sell: String,
}

#[derive(Deserialize)]
struct Currency {
    iso3: String,
    name: String,
    unit: i64,
}

pub fn parse(body: &str, now: DateTime<Utc>) -> Result<ForexSnapshot> {
    let response: Response = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(SOURCE_NAME, error.to_string()))?;

    // Days that do not carry a usable date are dropped rather than failing the
    // whole window.
    let mut days: Vec<(NaiveDate, &Day)> = response
        .data
        .payload
        .iter()
        .filter_map(|day| {
            NaiveDate::parse_from_str(&day.date, "%Y-%m-%d")
                .ok()
                .map(|date| (date, day))
        })
        .collect();
    days.sort_by_key(|(date, _)| *date);

    let (date, latest) = *days
        .last()
        .ok_or_else(|| ProviderError::parse(SOURCE_NAME, "no rates published in the window"))?;

    let rates: Vec<ForexRate> = latest
        .rates
        .iter()
        .filter_map(|rate| {
            Some(ForexRate {
                currency_code: rate.currency.iso3.clone(),
                currency_name: rate.currency.name.clone(),
                // A zero or missing unit would make every per-unit figure a
                // division by zero.
                unit: rate.currency.unit.max(1) as u32,
                buy: rate.buy.trim().parse().ok()?,
                sell: rate.sell.trim().parse().ok()?,
            })
        })
        .collect();

    if rates.is_empty() {
        return Err(ProviderError::parse(
            SOURCE_NAME,
            "the latest day carried no parseable rate",
        ));
    }

    // Every day in the window, oldest first, keyed by currency — a trend line
    // at no extra request cost.
    let mut history: BTreeMap<String, Vec<f64>> = BTreeMap::new();
    for (_, day) in &days {
        for rate in &day.rates {
            if let Ok(buy) = rate.buy.trim().parse::<f64>() {
                history
                    .entry(rate.currency.iso3.clone())
                    .or_default()
                    .push(buy);
            }
        }
    }

    Ok(ForexSnapshot {
        rates,
        history,
        date,
        published_on: latest.published_on.as_deref().and_then(parse_timestamp),
        modified_on: latest.modified_on.as_deref().and_then(parse_timestamp),
        freshness: Freshness::new(now),
    })
}

/// NRB stamps its timestamps in Nepal time without an offset, so the zone has
/// to be supplied rather than assumed to be UTC.
fn parse_timestamp(raw: &str) -> Option<DateTime<Utc>> {
    let naive = NaiveDateTime::parse_from_str(raw.trim(), "%Y-%m-%d %H:%M:%S").ok()?;
    sajilo_core::nepal_time::offset()
        .from_local_datetime(&naive)
        .single()
        .map(|dt| dt.with_timezone(&Utc))
}
