//! `/v1/bundle` — one request per popover open instead of one per module.
//!
//! Every module arrives wrapped in its own `LoadState`, so a single failed
//! upstream degrades one card rather than the whole response.

use crate::bazar::{FuelPriceSnapshot, MetalRateSnapshot, VegetableMarketSnapshot};
use crate::forex::ForexSnapshot;
use crate::load_state::LoadState;
use crate::news::NewsDigest;
use crate::radio::RadioDirectory;
use crate::rashifal::RashifalSnapshot;
use crate::weather::{WeatherLocation, WeatherSnapshot};

dto_enum! {
    pub enum ModuleKey {
        Weather,
        Forex,
        News,
        Metals,
        Fuel,
        Vegetables,
        Rashifal,
        Radio,
    }
}

dto! {
    /// What a client is asking for. An empty `modules` means "all of them".
    pub struct BundleRequest {
        #[serde(default)]
        pub modules: Vec<ModuleKey>,
        /// Weather is fetched per city, so the server only warms the ones
        /// clients actually ask for.
        #[serde(default)]
        pub weather_location: Option<WeatherLocation>,
    }

    /// Only the requested modules are populated; the rest stay `None` so a
    /// client can tell "not asked for" from "asked for and unavailable".
    #[derive(Default)]
    pub struct BundleResponse {
        pub weather: Option<LoadState<WeatherSnapshot>>,
        pub forex: Option<LoadState<ForexSnapshot>>,
        pub news: Option<LoadState<NewsDigest>>,
        pub metals: Option<LoadState<MetalRateSnapshot>>,
        pub fuel: Option<LoadState<FuelPriceSnapshot>>,
        pub vegetables: Option<LoadState<VegetableMarketSnapshot>>,
        pub rashifal: Option<LoadState<RashifalSnapshot>>,
        pub radio: Option<LoadState<RadioDirectory>>,
    }
}

impl ModuleKey {
    pub const ALL: [Self; 8] = [
        Self::Weather,
        Self::Forex,
        Self::News,
        Self::Metals,
        Self::Fuel,
        Self::Vegetables,
        Self::Rashifal,
        Self::Radio,
    ];

    /// The query-string spelling, also used as the cache and health key.
    pub fn key(self) -> &'static str {
        match self {
            Self::Weather => "weather",
            Self::Forex => "forex",
            Self::News => "news",
            Self::Metals => "metals",
            Self::Fuel => "fuel",
            Self::Vegetables => "vegetables",
            Self::Rashifal => "rashifal",
            Self::Radio => "radio",
        }
    }

    pub fn from_key(key: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|module| module.key() == key)
    }
}

impl BundleRequest {
    /// An empty request means every module.
    pub fn requested(&self) -> Vec<ModuleKey> {
        if self.modules.is_empty() {
            ModuleKey::ALL.to_vec()
        } else {
            self.modules.clone()
        }
    }
}
