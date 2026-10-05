//! Nepal Rastra Bank exchange rates — the official source, which is why
//! PRD §5.5 names it rather than an aggregator. Ported from
//! `NRBForexProvider.swift`.

use std::collections::BTreeMap;

use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, TimeZone, Utc};
use sajilo_api::forex::{ForexHistory, ForexPoint, ForexRate, ForexSnapshot};
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

/// How far back the chart reaches.
pub const HISTORY_DAYS: i64 = 366;
/// NRB serves at most 100 days a page; a year is four. The cap stops a
/// misbehaving `pages` count from turning one chart into a crawl.
const HISTORY_MAX_PAGES: u32 = 6;

pub fn history_url(today: NaiveDate, page: u32) -> String {
    let start = today - Duration::days(HISTORY_DAYS);
    format!(
        "https://www.nrb.org.np/api/forex/v1/rates?page={page}&per_page=100&from={start}&to={today}"
    )
}

/// A year of daily rates, every page of it.
pub async fn fetch_history(
    client: &HttpClient,
    today: NaiveDate,
    now: DateTime<Utc>,
) -> Result<ForexHistory> {
    let first = client.get_text(SOURCE_NAME, &history_url(today, 1)).await?;
    let pages = page_count(&first).min(HISTORY_MAX_PAGES);
    let mut bodies = vec![first];
    for page in 2..=pages {
        bodies.push(
            client
                .get_text(SOURCE_NAME, &history_url(today, page))
                .await?,
        );
    }
    parse_history(&bodies, now)
}

#[derive(Deserialize)]
struct Paged {
    pagination: Option<Pagination>,
}

#[derive(Deserialize)]
struct Pagination {
    pages: u32,
}

fn page_count(body: &str) -> u32 {
    serde_json::from_str::<Paged>(body)
        .ok()
        .and_then(|paged| paged.pagination)
        .map_or(1, |pagination| pagination.pages.max(1))
}

/// Every page's days merged into one series per currency, oldest first. A
/// day or a rate that doesn't parse is skipped, not fatal: a gap in a year
/// of points is invisible, a failed chart is not.
pub fn parse_history(bodies: &[String], now: DateTime<Utc>) -> Result<ForexHistory> {
    let mut by_date: BTreeMap<NaiveDate, Vec<Rate>> = BTreeMap::new();
    for body in bodies {
        let response: Response = serde_json::from_str(body)
            .map_err(|error| ProviderError::parse(SOURCE_NAME, error.to_string()))?;
        for day in response.data.payload {
            if let Ok(date) = NaiveDate::parse_from_str(&day.date, "%Y-%m-%d") {
                by_date.insert(date, day.rates);
            }
        }
    }

    let mut series: BTreeMap<String, Vec<ForexPoint>> = BTreeMap::new();
    let mut units = BTreeMap::new();
    for (date, rates) in &by_date {
        let time = date
            .and_hms_opt(0, 0, 0)
            .map_or(0, |at| at.and_utc().timestamp());
        for rate in rates {
            let (Some(buy), Some(sell)) = (rate.buy(), rate.sell()) else {
                continue;
            };
            units.insert(rate.currency.iso3.clone(), rate.currency.unit.max(1) as u32);
            series
                .entry(rate.currency.iso3.clone())
                .or_default()
                .push(ForexPoint { time, buy, sell });
        }
    }
    if series.is_empty() {
        return Err(ProviderError::parse(
            SOURCE_NAME,
            "no rates in the history window",
        ));
    }
    Ok(ForexHistory {
        series,
        units,
        freshness: Freshness::new(now),
    })
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
    // it did not quote that day — and `null` for every currency on a day it
    // published no rates at all (6 Aug 2026).
    buy: Option<String>,
    sell: Option<String>,
}

impl Rate {
    fn buy(&self) -> Option<f64> {
        self.buy.as_deref()?.trim().parse().ok()
    }

    fn sell(&self) -> Option<f64> {
        self.sell.as_deref()?.trim().parse().ok()
    }
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

    // The newest day that quotes anything: NRB has published days whose
    // every rate is null, and those must not blank the screen.
    let (date, latest) = *days
        .iter()
        .rev()
        .find(|(_, day)| day.rates.iter().any(|rate| rate.buy().is_some()))
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
                buy: rate.buy()?,
                sell: rate.sell()?,
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
            if let Some(buy) = rate.buy() {
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
