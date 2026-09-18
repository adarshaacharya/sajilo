//! Open-Meteo forecast and air quality. Ported from `WeatherSnapshot.swift` and
//! `AirQuality.swift`. Places are `sajilo_core::places`, addressed by id.

use chrono::{DateTime, NaiveDate, Utc};

use crate::load_state::Freshness;

dto_enum! {
    pub enum WeatherCondition {
        Clear,
        PartlyCloudy,
        Overcast,
        Fog,
        Drizzle,
        Rain,
        Snow,
        Showers,
        Thunderstorm,
        Unknown,
    }

    pub enum AqiCategory {
        Good,
        Moderate,
        UnhealthyForSensitive,
        Unhealthy,
        VeryUnhealthy,
        Hazardous,
    }
}

dto! {
    pub struct DailyForecast {
        pub date: NaiveDate,
        pub high_celsius: f64,
        pub low_celsius: f64,
        pub condition: WeatherCondition,
        /// Chance of precipitation, 0–100.
        pub precipitation_chance: u8,
    }


    pub struct AirQuality {
        /// The US AQI scale, which is what Nepali outlets quote.
        pub us_aqi: i32,
        pub pm25: f64,
        pub pm10: f64,
        pub observed_at: DateTime<Utc>,
    }

    pub struct WeatherSnapshot {
        /// Which place this reading describes, by `sajilo_core::places` id.
        /// Without it a cached Kathmandu reading could be rendered under a
        /// Pokhara heading.
        pub place_id: String,
        pub temperature_celsius: f64,
        pub apparent_temperature_celsius: f64,
        pub precipitation_chance: u8,
        pub high_celsius: f64,
        pub low_celsius: f64,
        pub condition: WeatherCondition,
        /// Today's sunrise and sunset at the selected location, used to place
        /// the sky phase against the real day rather than fixed clock hours.
        pub sunrise: Option<DateTime<Utc>>,
        pub sunset: Option<DateTime<Utc>>,
        /// Today first, then the following days (PRD §5.4).
        pub daily: Vec<DailyForecast>,
        /// Optional by design: air quality comes from a separate endpoint, and
        /// a forecast is still worth showing when only that one is unreachable.
        pub air_quality: Option<AirQuality>,
        /// When the reading was taken at source. `freshness` records when
        /// Sajilo retrieved it; this is what the user is told.
        pub observed_at: DateTime<Utc>,
        pub freshness: Freshness,
    }
}

impl WeatherCondition {
    /// WMO weather codes, as Open-Meteo publishes them.
    pub fn from_wmo_code(code: u16) -> Self {
        match code {
            0 => Self::Clear,
            1..=2 => Self::PartlyCloudy,
            3 => Self::Overcast,
            45 | 48 => Self::Fog,
            51..=57 => Self::Drizzle,
            61..=67 => Self::Rain,
            71..=77 => Self::Snow,
            80..=82 => Self::Showers,
            85 | 86 => Self::Snow,
            95..=99 => Self::Thunderstorm,
            _ => Self::Unknown,
        }
    }

    pub fn title(self) -> &'static str {
        match self {
            Self::Clear => "Clear",
            Self::PartlyCloudy => "Partly cloudy",
            Self::Overcast => "Overcast",
            Self::Fog => "Fog",
            Self::Drizzle => "Drizzle",
            Self::Rain => "Rain",
            Self::Snow => "Snow",
            Self::Showers => "Showers",
            Self::Thunderstorm => "Thunderstorm",
            Self::Unknown => "Weather unavailable",
        }
    }
}

impl AqiCategory {
    /// US AQI breakpoints.
    pub fn from_us_aqi(value: i32) -> Self {
        match value {
            ..=50 => Self::Good,
            51..=100 => Self::Moderate,
            101..=150 => Self::UnhealthyForSensitive,
            151..=200 => Self::Unhealthy,
            201..=300 => Self::VeryUnhealthy,
            _ => Self::Hazardous,
        }
    }
}

impl AirQuality {
    pub fn category(&self) -> AqiCategory {
        AqiCategory::from_us_aqi(self.us_aqi)
    }
}

impl WeatherSnapshot {
    /// `daily[0]` is today, so tomorrow is the next entry.
    pub fn tomorrow(&self) -> Option<&DailyForecast> {
        self.daily.get(1)
    }
}
