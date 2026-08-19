//! Gold and silver from the Federation of Nepal Gold & Silver Dealers'
//! Association. Ported from `FenegosidaMetalProvider.swift`.

use chrono::{DateTime, Utc};
use sajilo_api::bazar::{Metal, MetalRate, MetalRateSnapshot, MetalUnit};
use sajilo_api::load_state::Freshness;
use serde::Deserialize;

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "FENEGOSIDA metals";

const HOST: &str = "https://api.fenegosida.org/api/website/v1";

pub fn today_url() -> String {
    format!("{HOST}/Dashboard/today")
}

pub fn history_url() -> String {
    format!("{HOST}/Dashboard/WeeklyChartRate?weekmonthyear=7")
}

pub async fn fetch(client: &HttpClient, now: DateTime<Utc>) -> Result<MetalRateSnapshot> {
    let body = client.get_text(SOURCE_NAME, &today_url()).await?;
    let mut snapshot = parse(&body, now)?;

    // History is a nice-to-have; today's rate is not. A failing chart endpoint
    // costs the sparkline and nothing else.
    if let Ok(chart) = client.get_text(SOURCE_NAME, &history_url()).await {
        snapshot.gold_history = parse_history(&chart);
    }
    Ok(snapshot)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    today_date: DateTime<Utc>,
    /// Named for grams upstream, but it holds the rate for whatever unit
    /// `rate_type` names — 305,200 for one *tola* of gold. Reading it as a
    /// per-gram figure would be out by more than an order of magnitude.
    today_base_rate_per_gram: f64,
    // Upstream's own spelling of "yesterday".
    yestarday_base_rate_per_gram: f64,
    rate_type: String,
}

pub fn parse(body: &str, now: DateTime<Utc>) -> Result<MetalRateSnapshot> {
    let entries: Vec<Entry> = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(SOURCE_NAME, error.to_string()))?;

    let rates: Vec<MetalRate> = entries
        .iter()
        .filter_map(|entry| {
            Some(MetalRate {
                metal: metal_from(&entry.rate_type)?,
                unit: unit_from(&entry.rate_type)?,
                price: entry.today_base_rate_per_gram,
                previous_price: entry.yestarday_base_rate_per_gram,
            })
        })
        .collect();

    if rates.is_empty() {
        return Err(ProviderError::parse(
            SOURCE_NAME,
            "no recognisable metal rate in the payload",
        ));
    }

    let published_at = entries.iter().map(|entry| entry.today_date).max();
    let mut freshness = Freshness::new(now);
    if let Some(published_at) = published_at {
        freshness = freshness.with_source(published_at);
    }

    Ok(MetalRateSnapshot {
        rates,
        gold_history: Vec::new(),
        freshness,
    })
}

/// `rate_type` is free Nepali text — "छापावाल सुन (१ तोला)" — so the metal and
/// the unit are read out of it. Matching on substrings rather than exact
/// equality means a spacing or punctuation change upstream does not drop the
/// row entirely.
pub fn metal_from(rate_type: &str) -> Option<Metal> {
    if rate_type.contains("चाँदी") {
        return Some(Metal::Silver);
    }
    if rate_type.contains("तेजाबी") {
        return Some(Metal::TejabiGold);
    }
    if rate_type.contains("सुन") {
        return Some(Metal::FineGold);
    }
    None
}

pub fn unit_from(rate_type: &str) -> Option<MetalUnit> {
    // Check grams first: being explicit avoids depending on "१० ग्राम" never
    // also carrying a tola marker.
    if rate_type.contains("ग्राम") {
        return Some(MetalUnit::TenGram);
    }
    if rate_type.contains("तोला") {
        return Some(MetalUnit::Tola);
    }
    None
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Chart {
    gold_data: Vec<ChartPoint>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChartPoint {
    tola: Option<f64>,
}

/// A missing or malformed chart costs the sparkline, never the rate, so this
/// returns an empty series rather than an error.
pub fn parse_history(body: &str) -> Vec<f64> {
    serde_json::from_str::<Chart>(body)
        .map(|chart| chart.gold_data.into_iter().filter_map(|p| p.tola).collect())
        .unwrap_or_default()
}
