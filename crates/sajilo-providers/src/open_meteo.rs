//! Weather and air quality from Open-Meteo — public, keyless, and the reason
//! Sajilo needs no account system. Ported from `OpenMeteoWeatherProvider.swift`.
//!
//! Open-Meteo returns times in the requested timezone with no offset attached,
//! so every timestamp here is anchored to Nepal explicitly rather than being
//! assumed UTC.

use chrono::{DateTime, NaiveDate, NaiveDateTime, TimeZone, Utc};
use sajilo_api::load_state::Freshness;
use sajilo_api::weather::{
    AirQuality, DailyForecast, WeatherCondition, WeatherLocation, WeatherSnapshot,
};
use serde::Deserialize;

use crate::error::{ProviderError, Result};
use crate::http::HttpClient;

pub const SOURCE_NAME: &str = "Open-Meteo";

/// Six days: today plus the five-day outlook PRD §5.4 shows.
const FORECAST_DAYS: u8 = 6;

pub fn forecast_url(location: WeatherLocation) -> String {
    format!(
        "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}\
         &current=temperature_2m,apparent_temperature,weather_code\
         &daily=weather_code,temperature_2m_max,temperature_2m_min,\
         precipitation_probability_max,sunrise,sunset\
         &timezone=Asia%2FKathmandu&forecast_days={FORECAST_DAYS}",
        lat = location.latitude(),
        lon = location.longitude(),
    )
}

pub fn air_quality_url(location: WeatherLocation) -> String {
    format!(
        "https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lon}\
         &current=us_aqi,pm2_5,pm10&timezone=Asia%2FKathmandu",
        lat = location.latitude(),
        lon = location.longitude(),
    )
}

pub async fn fetch(
    client: &HttpClient,
    location: WeatherLocation,
    now: DateTime<Utc>,
) -> Result<WeatherSnapshot> {
    let body = client
        .get_text(SOURCE_NAME, &forecast_url(location))
        .await?;
    let mut snapshot = parse_forecast(&body, location, now)?;

    // Air quality is a separate endpoint, and a forecast is still worth showing
    // when only that one is unreachable.
    if let Ok(air) = client
        .get_text(SOURCE_NAME, &air_quality_url(location))
        .await
    {
        snapshot.air_quality = parse_air_quality(&air);
    }
    Ok(snapshot)
}

#[derive(Deserialize)]
struct ForecastResponse {
    current: Current,
    daily: Daily,
}

#[derive(Deserialize)]
struct Current {
    time: String,
    temperature_2m: f64,
    apparent_temperature: f64,
    weather_code: u16,
}

/// Open-Meteo returns parallel arrays rather than a list of records, so the
/// columns are zipped back together below.
#[derive(Deserialize)]
struct Daily {
    time: Vec<String>,
    weather_code: Vec<u16>,
    temperature_2m_max: Vec<f64>,
    temperature_2m_min: Vec<f64>,
    precipitation_probability_max: Vec<Option<f64>>,
    sunrise: Vec<String>,
    sunset: Vec<String>,
}

pub fn parse_forecast(
    body: &str,
    location: WeatherLocation,
    now: DateTime<Utc>,
) -> Result<WeatherSnapshot> {
    let response: ForecastResponse = serde_json::from_str(body)
        .map_err(|error| ProviderError::parse(SOURCE_NAME, error.to_string()))?;

    let daily = &response.daily;
    // A short column would silently misalign every row after it, so the day
    // count is the shortest column rather than `time.len()`.
    let days = [
        daily.time.len(),
        daily.weather_code.len(),
        daily.temperature_2m_max.len(),
        daily.temperature_2m_min.len(),
    ]
    .into_iter()
    .min()
    .unwrap_or(0);

    if days == 0 {
        return Err(ProviderError::parse(SOURCE_NAME, "empty daily forecast"));
    }

    let forecast: Vec<DailyForecast> = (0..days)
        .filter_map(|index| {
            Some(DailyForecast {
                date: NaiveDate::parse_from_str(&daily.time[index], "%Y-%m-%d").ok()?,
                high_celsius: daily.temperature_2m_max[index],
                low_celsius: daily.temperature_2m_min[index],
                condition: WeatherCondition::from_wmo_code(daily.weather_code[index]),
                precipitation_chance: daily
                    .precipitation_probability_max
                    .get(index)
                    .copied()
                    .flatten()
                    .unwrap_or(0.0)
                    .clamp(0.0, 100.0) as u8,
            })
        })
        .collect();

    let today = forecast
        .first()
        .ok_or_else(|| ProviderError::parse(SOURCE_NAME, "no usable day in the forecast"))?;

    Ok(WeatherSnapshot {
        location,
        temperature_celsius: response.current.temperature_2m,
        apparent_temperature_celsius: response.current.apparent_temperature,
        precipitation_chance: today.precipitation_chance,
        high_celsius: today.high_celsius,
        low_celsius: today.low_celsius,
        condition: WeatherCondition::from_wmo_code(response.current.weather_code),
        sunrise: daily.sunrise.first().and_then(|raw| parse_nepal_time(raw)),
        sunset: daily.sunset.first().and_then(|raw| parse_nepal_time(raw)),
        observed_at: parse_nepal_time(&response.current.time).unwrap_or(now),
        daily: forecast,
        air_quality: None,
        freshness: Freshness::new(now),
    })
}

#[derive(Deserialize)]
struct AirQualityResponse {
    current: CurrentAir,
}

#[derive(Deserialize)]
struct CurrentAir {
    time: String,
    us_aqi: Option<f64>,
    pm2_5: Option<f64>,
    pm10: Option<f64>,
}

/// Returns `None` rather than an error: a missing AQI panel is acceptable,
/// a missing forecast is not.
pub fn parse_air_quality(body: &str) -> Option<AirQuality> {
    let response: AirQualityResponse = serde_json::from_str(body).ok()?;
    Some(AirQuality {
        // Without an index there is no panel worth drawing.
        us_aqi: response.current.us_aqi? as i32,
        pm25: response.current.pm2_5.unwrap_or(0.0),
        pm10: response.current.pm10.unwrap_or(0.0),
        observed_at: parse_nepal_time(&response.current.time)?,
    })
}

/// `2026-08-17T10:30` — local to Asia/Kathmandu, with no offset in the string.
fn parse_nepal_time(raw: &str) -> Option<DateTime<Utc>> {
    let naive = NaiveDateTime::parse_from_str(raw.trim(), "%Y-%m-%dT%H:%M")
        .or_else(|_| NaiveDateTime::parse_from_str(raw.trim(), "%Y-%m-%dT%H:%M:%S"))
        .ok()?;
    sajilo_core::nepal_time::offset()
        .from_local_datetime(&naive)
        .single()
        .map(|dt| dt.with_timezone(&Utc))
}
