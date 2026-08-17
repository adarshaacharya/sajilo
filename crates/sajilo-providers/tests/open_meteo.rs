//! Reads only from `fixtures/open-meteo/`.

use chrono::{TimeZone, Timelike, Utc};
use sajilo_api::weather::{AqiCategory, WeatherLocation};
use sajilo_providers::open_meteo;

const FORECAST: &str = include_str!("../../../fixtures/open-meteo/forecast.json");
const AIR_QUALITY: &str = include_str!("../../../fixtures/open-meteo/air-quality.json");

fn parsed() -> sajilo_api::weather::WeatherSnapshot {
    open_meteo::parse_forecast(
        FORECAST,
        WeatherLocation::Kathmandu,
        Utc.timestamp_opt(1_800_000_000, 0).unwrap(),
    )
    .expect("fixture parses")
}

#[test]
fn decodes_the_recorded_forecast() {
    let snapshot = parsed();
    assert_eq!(snapshot.location, WeatherLocation::Kathmandu);
    assert!((-20.0..50.0).contains(&snapshot.temperature_celsius));
    assert!(snapshot.high_celsius >= snapshot.low_celsius);
    assert!(snapshot.precipitation_chance <= 100);
}

/// PRD §5.4 shows today plus a five-day outlook.
#[test]
fn returns_today_first_then_the_outlook() {
    let snapshot = parsed();
    assert_eq!(snapshot.daily.len(), 6);

    let dates: Vec<_> = snapshot.daily.iter().map(|day| day.date).collect();
    let mut sorted = dates.clone();
    sorted.sort_unstable();
    assert_eq!(dates, sorted, "days must be chronological");

    let tomorrow = snapshot.tomorrow().expect("an outlook day exists");
    assert_eq!(tomorrow.date, snapshot.daily[0].date.succ_opt().unwrap());
}

/// Open-Meteo stamps times in the requested zone with no offset. Reading them
/// as UTC would shift every reading by 5h45m.
#[test]
fn anchors_timestamps_to_nepal_not_utc() {
    let snapshot = parsed();
    // The fixture's current time is 2026-08-17T10:30 Nepal = 04:45 UTC.
    assert_eq!(snapshot.observed_at.hour(), 4);
    assert_eq!(snapshot.observed_at.minute(), 45);

    // Sunrise in Kathmandu is in the morning local time, never near midnight.
    let sunrise = snapshot.sunrise.expect("sunrise is published");
    let local = sunrise.with_timezone(&sajilo_core::nepal_time::offset());
    assert!(
        (4..8).contains(&local.hour()),
        "sunrise should be a morning hour, got {}",
        local.hour()
    );
    let sunset = snapshot.sunset.expect("sunset is published");
    assert!(sunset > sunrise);
}

#[test]
fn maps_the_wmo_code_to_a_condition() {
    let snapshot = parsed();
    // The fixture reports code 3 (overcast) as the current condition.
    assert_eq!(
        snapshot.condition,
        sajilo_api::weather::WeatherCondition::Overcast
    );
    assert!(
        snapshot
            .daily
            .iter()
            .all(|day| day.condition != sajilo_api::weather::WeatherCondition::Unknown),
        "every code in the fixture should be recognised"
    );
}

#[test]
fn decodes_the_recorded_air_quality() {
    let air = open_meteo::parse_air_quality(AIR_QUALITY).expect("fixture parses");
    assert!(air.us_aqi > 0);
    assert!(air.pm25 > 0.0);
    assert!(air.pm10 > 0.0);
    assert_eq!(air.category(), AqiCategory::from_us_aqi(air.us_aqi));
}

/// A missing AQI panel is acceptable; a missing forecast is not. So air quality
/// degrades to `None` while the forecast raises.
#[test]
fn air_quality_degrades_instead_of_failing() {
    assert!(open_meteo::parse_air_quality("not json").is_none());
    assert!(open_meteo::parse_air_quality(r#"{"current":{"time":"2026-08-17T09:45"}}"#).is_none());
}

#[test]
fn rejects_a_forecast_it_cannot_read() {
    let now = Utc.timestamp_opt(0, 0).unwrap();
    let location = WeatherLocation::Kathmandu;
    assert!(open_meteo::parse_forecast("not json", location, now).is_err());

    let empty = r#"{"current":{"time":"2026-08-17T10:30","interval":900,
        "temperature_2m":23.1,"apparent_temperature":27.1,"weather_code":3},
        "daily":{"time":[],"weather_code":[],"temperature_2m_max":[],
        "temperature_2m_min":[],"precipitation_probability_max":[],
        "sunrise":[],"sunset":[]}}"#;
    assert!(open_meteo::parse_forecast(empty, location, now).is_err());
}

/// A short column would silently misalign every row after it, so the day count
/// is the shortest column rather than the longest.
#[test]
fn truncates_to_the_shortest_column() {
    let ragged = r#"{"current":{"time":"2026-08-17T10:30","interval":900,
        "temperature_2m":23.1,"apparent_temperature":27.1,"weather_code":3},
        "daily":{"time":["2026-08-17","2026-08-18","2026-08-19"],
        "weather_code":[0,1],"temperature_2m_max":[30.0,31.0],
        "temperature_2m_min":[20.0,21.0],"precipitation_probability_max":[10],
        "sunrise":["2026-08-17T05:20"],"sunset":["2026-08-17T18:30"]}}"#;
    let snapshot = open_meteo::parse_forecast(
        ragged,
        WeatherLocation::Kathmandu,
        Utc.timestamp_opt(0, 0).unwrap(),
    )
    .expect("ragged but usable");
    assert_eq!(snapshot.daily.len(), 2);
    // The missing probability defaults rather than shifting the column.
    assert_eq!(snapshot.daily[1].precipitation_chance, 0);
}

#[test]
fn builds_a_url_per_location() {
    for location in WeatherLocation::ALL {
        let url = open_meteo::forecast_url(location);
        assert!(url.contains(&location.latitude().to_string()), "{url}");
        assert!(url.contains("timezone=Asia%2FKathmandu"), "{url}");
        assert!(open_meteo::air_quality_url(location).contains("us_aqi"));
    }
}
