//! Nepal Oil Corporation, the state importer that sets every retail fuel price
//! in the country.
//!
//! NOC's site became a client-rendered app in late 2026, so its old price table
//! is no longer in the page. The app reads the same public, keyless JSON the
//! site itself uses: every price revision, per fuel and depot. Kathmandu's
//! revisions are the ones shown, as the old table showed.
//!
//! Decoded defensively: every field the response carries is optional here, a
//! fuel is matched by its slug rather than a position, and a row that cannot
//! be read is skipped rather than failing the whole snapshot.

use chrono::{DateTime, Datelike, NaiveDate, NaiveDateTime, Utc};
use sajilo_api::bazar::{Fuel, FuelPoint, FuelPrice, FuelPriceSnapshot};
use sajilo_api::load_state::Freshness;
use serde::Deserialize;

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "NOC fuel";

/// Kathmandu's revisions only: the full list is close to a megabyte.
pub const ENDPOINT: &str = "https://beta.noc.org.np/api/fuel-prices?search=Kathmandu&per_page=500";

/// The depot whose prices are shown.
const LOCATION: &str = "kathmandu";

pub async fn fetch(client: &HttpClient, now: DateTime<Utc>) -> Result<FuelPriceSnapshot> {
    let body = client.get_text(SOURCE_NAME, ENDPOINT).await?;
    parse(&body, now)
}

#[derive(Deserialize)]
struct Response {
    #[serde(default)]
    data: Vec<Row>,
}

#[derive(Deserialize)]
struct Row {
    price: Option<serde_json::Value>,
    price_date: Option<String>,
    fuel_type: Option<Named>,
    location: Option<Named>,
}

#[derive(Deserialize)]
struct Named {
    slug: Option<String>,
    name: Option<String>,
}

/// One revision of one fuel's price.
struct Revision {
    fuel: Fuel,
    price: f64,
    at: NaiveDateTime,
}

pub fn parse(body: &str, now: DateTime<Utc>) -> Result<FuelPriceSnapshot> {
    let response: Response = serde_json::from_str(body).map_err(|error| {
        ProviderError::parse(SOURCE_NAME, format!("not the price list: {error}"))
    })?;

    let revisions: Vec<Revision> = response.data.iter().filter_map(revision).collect();

    let mut prices = Vec::new();
    let mut effective_from: Option<NaiveDate> = None;
    for fuel in Fuel::ALL {
        let mut own: Vec<&Revision> = revisions.iter().filter(|rev| rev.fuel == fuel).collect();
        own.sort_by_key(|rev| std::cmp::Reverse(rev.at));
        let Some(current) = own.first() else {
            continue;
        };
        // The revision it replaced is the newest one from an earlier day: NOC
        // sometimes enters the same day's price twice, minutes apart.
        let previous = own
            .iter()
            .find(|rev| rev.at.date() < current.at.date())
            .map_or(current.price, |rev| rev.price);
        // One point per day, the day's last entry, oldest first: the step
        // chart's revisions.
        let mut history: Vec<FuelPoint> = Vec::new();
        for rev in own.iter().rev() {
            let time = rev
                .at
                .date()
                .and_hms_opt(0, 0, 0)
                .map_or(0, |at| at.and_utc().timestamp());
            match history.last_mut() {
                Some(last) if last.time == time => last.price = rev.price,
                _ => history.push(FuelPoint {
                    time,
                    price: rev.price,
                }),
            }
        }
        prices.push(FuelPrice {
            fuel,
            price: current.price,
            previous_price: previous,
            changed_on: Some(current.at.date()),
            history,
        });
        let day = current.at.date();
        effective_from = Some(effective_from.map_or(day, |known| known.max(day)));
    }

    if prices.is_empty() {
        return Err(ProviderError::parse(
            SOURCE_NAME,
            "no Kathmandu fuel price in the response",
        ));
    }

    Ok(FuelPriceSnapshot {
        prices,
        effective_from: effective_from.unwrap_or_else(|| now.date_naive()),
        freshness: Freshness::new(now),
    })
}

fn revision(row: &Row) -> Option<Revision> {
    let location = row.location.as_ref()?;
    let place = location.name.as_deref().or(location.slug.as_deref())?;
    if !place.trim().eq_ignore_ascii_case(LOCATION) {
        return None;
    }
    let fuel = fuel(row.fuel_type.as_ref()?.slug.as_deref()?)?;
    let price = match row.price.as_ref()? {
        serde_json::Value::String(text) => text.trim().replace(',', "").parse().ok()?,
        serde_json::Value::Number(number) => number.as_f64()?,
        _ => return None,
    };
    // NaN fails this too.
    if !price.is_finite() || price <= 0.0 {
        return None;
    }
    let at = price_date(row.price_date.as_deref()?)?;
    Some(Revision { fuel, price, at })
}

/// NOC's slug for each fuel. Aviation fuels are left out.
fn fuel(slug: &str) -> Option<Fuel> {
    Some(match slug.trim() {
        "petrol" => Fuel::Petrol,
        "diesel" => Fuel::Diesel,
        "kerosene" => Fuel::Kerosene,
        "lp-gas" | "lpg" => Fuel::Lpg,
        _ => return None,
    })
}

/// `2026-10-01 09:39:00`, or the date alone.
pub fn price_date(text: &str) -> Option<NaiveDateTime> {
    let text = text.trim();
    NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M:%S")
        .ok()
        .or_else(|| {
            NaiveDate::parse_from_str(text.get(..10)?, "%Y-%m-%d")
                .ok()?
                .and_hms_opt(0, 0, 0)
        })
        .filter(|at| at.year() > 1900)
}
