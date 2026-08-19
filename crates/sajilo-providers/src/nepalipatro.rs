//! Gold and silver from Nepali Patro's bullion API.
//!
//! The same Federation figures FENEGOSIDA publishes — the payload says
//! `"source": "Fenegosida"` — but served as plain JSON by a different operator,
//! which is exactly what a fallback needs to be. It carries more than the
//! Federation's own endpoint does: every rate is dated, so the previous close
//! and the sparkline come out of one response instead of a second request.
//!
//! Keys are terse: `t_` is per tola and `g_` per ten grams, `ha` is hallmark
//! (the Federation's fine gold), `te` tejabi, `s` silver. A zero means the
//! Federation published no rate for that grade that day — tejabi is often zero
//! — and a zero rate is dropped rather than shown as free gold.

use std::collections::BTreeMap;

use chrono::{DateTime, Duration, Utc};
use sajilo_api::bazar::{Metal, MetalRate, MetalRateSnapshot, MetalUnit};
use sajilo_api::load_state::Freshness;
use serde::Deserialize;

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "NepaliPatro bullions";

const HOST: &str = "https://api.nepalipatro.com.np/v3/bullions";

/// Without `from-date` the API returns its entire history — over 4,000 days.
/// A month is enough for the latest rate, the previous close, and the week the
/// sparkline draws.
const HISTORY_DAYS: i64 = 30;

/// Gold per tola over the last week, oldest first, to match what the
/// Federation's own endpoint supplies for the sparkline.
const SPARKLINE_DAYS: usize = 7;

pub fn url(now: DateTime<Utc>) -> String {
    let from = (now - Duration::days(HISTORY_DAYS)).format("%Y-%m-%d");
    format!("{HOST}?from-date={from}")
}

#[derive(Deserialize)]
struct Payload {
    /// Keyed by ISO date. A `BTreeMap` sorts them for us, so "latest" and
    /// "the one before it" are the last two entries rather than a hand-rolled
    /// date comparison.
    data: BTreeMap<String, Day>,
}

/// Rates for one day. Every field is optional: the API has published nulls for
/// grades it has no figure for, and a missing rate must not fail the payload.
#[derive(Deserialize, Default, Clone, Copy)]
struct Day {
    #[serde(default)]
    t_ha: Option<f64>,
    #[serde(default)]
    t_te: Option<f64>,
    #[serde(default)]
    t_s: Option<f64>,
    #[serde(default)]
    g_ha: Option<f64>,
    #[serde(default)]
    g_te: Option<f64>,
    #[serde(default)]
    g_s: Option<f64>,
}

impl Day {
    fn rate(&self, metal: Metal, unit: MetalUnit) -> Option<f64> {
        let value = match (metal, unit) {
            (Metal::FineGold, MetalUnit::Tola) => self.t_ha,
            (Metal::TejabiGold, MetalUnit::Tola) => self.t_te,
            (Metal::Silver, MetalUnit::Tola) => self.t_s,
            (Metal::FineGold, MetalUnit::TenGram) => self.g_ha,
            (Metal::TejabiGold, MetalUnit::TenGram) => self.g_te,
            (Metal::Silver, MetalUnit::TenGram) => self.g_s,
        }?;
        (value > 0.0).then_some(value)
    }
}

pub async fn fetch(client: &HttpClient, now: DateTime<Utc>) -> Result<MetalRateSnapshot> {
    let body = client.get_text(SOURCE_NAME, &url(now)).await?;
    parse(&body, now)
}

pub fn parse(body: &str, now: DateTime<Utc>) -> Result<MetalRateSnapshot> {
    let payload: Payload = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(SOURCE_NAME, error.to_string()))?;

    let mut days = payload.data.values().rev();
    let latest = *days
        .next()
        .ok_or_else(|| ProviderError::parse(SOURCE_NAME, "the payload carries no days"))?;
    // The trading day before, which is not always yesterday — the market closes
    // on holidays, and the API simply omits those dates.
    let previous = days.next().copied().unwrap_or(latest);

    let rates: Vec<MetalRate> = [Metal::FineGold, Metal::TejabiGold, Metal::Silver]
        .into_iter()
        .flat_map(|metal| [MetalUnit::Tola, MetalUnit::TenGram].map(|unit| (metal, unit)))
        .filter_map(|(metal, unit)| {
            let price = latest.rate(metal, unit)?;
            Some(MetalRate {
                metal,
                unit,
                price,
                previous_price: previous.rate(metal, unit).unwrap_or(price),
            })
        })
        .collect();

    if rates.is_empty() {
        return Err(ProviderError::parse(
            SOURCE_NAME,
            "the latest day carries no non-zero rate",
        ));
    }

    let mut gold_history: Vec<f64> = payload
        .data
        .values()
        .rev()
        .take(SPARKLINE_DAYS)
        .filter_map(|day| day.rate(Metal::FineGold, MetalUnit::Tola))
        .collect();
    gold_history.reverse();

    Ok(MetalRateSnapshot {
        rates,
        gold_history,
        freshness: Freshness::new(now),
    })
}
