//! Open-Meteo forecast and air quality. Ported from `WeatherSnapshot.swift`,
//! `AirQuality.swift` and `WeatherLocation.swift`.

use chrono::{DateTime, NaiveDate, Utc};

use crate::load_state::Freshness;

dto_enum! {
    #[derive(Default)]
    pub enum WeatherLocation {
        #[default]
        Kathmandu,
        Pokhara,
        Lalitpur,
    }

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
        /// Which place this reading describes. Without it a cached Kathmandu
        /// reading could be rendered under a Pokhara heading.
        pub location: WeatherLocation,
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

impl WeatherLocation {
    pub const ALL: [Self; 3] = [Self::Kathmandu, Self::Pokhara, Self::Lalitpur];

    pub fn display_name(self) -> &'static str {
        match self {
            Self::Kathmandu => "Kathmandu",
            Self::Pokhara => "Pokhara",
            Self::Lalitpur => "Lalitpur",
        }
    }

    pub fn nepali_name(self) -> &'static str {
        match self {
            Self::Kathmandu => "काठमाडौं",
            Self::Pokhara => "पोखरा",
            Self::Lalitpur => "ललितपुर",
        }
    }

    pub fn latitude(self) -> f64 {
        match self {
            Self::Kathmandu => 27.7172,
            Self::Pokhara => 28.2096,
            Self::Lalitpur => 27.6588,
        }
    }

    pub fn longitude(self) -> f64 {
        match self {
            Self::Kathmandu => 85.3240,
            Self::Pokhara => 83.9856,
            Self::Lalitpur => 85.3247,
        }
    }

    /// The stable key a cache slot and an API query string are built from.
    pub fn key(self) -> &'static str {
        match self {
            Self::Kathmandu => "kathmandu",
            Self::Pokhara => "pokhara",
            Self::Lalitpur => "lalitpur",
        }
    }

    pub fn from_key(key: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|location| location.key() == key)
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
