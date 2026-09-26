//! Crypto prices, for information. Buying, selling or holding crypto is not
//! legal in Nepal; Sajilo shows the market the way a newspaper would, in US
//! dollars, and never links to an exchange.

use crate::load_state::Freshness;

dto! {
    /// One coin as the market list shows it, most prominent first.
    pub struct CryptoCoin {
        /// The source's stable id, used to ask for this coin's chart.
        pub id: String,
        /// Ticker, upper case: `BTC`.
        pub symbol: String,
        pub name: String,
        pub image_url: Option<String>,
        /// Position by market value; `None` where the source gives none.
        pub rank: Option<u32>,
        /// US dollars.
        pub price: f64,
        /// Percent over the last 24 hours and 7 days.
        pub change_24h: Option<f64>,
        pub change_7d: Option<f64>,
        pub market_cap: Option<f64>,
        /// US dollars traded in the last 24 hours.
        pub volume_24h: Option<f64>,
        pub high_24h: Option<f64>,
        pub low_24h: Option<f64>,
        pub circulating_supply: Option<f64>,
        pub max_supply: Option<f64>,
        /// All-time high, how far below it the price is (percent, negative),
        /// and when it was reached (ISO date).
        pub all_time_high: Option<f64>,
        pub from_all_time_high: Option<f64>,
        pub all_time_high_date: Option<String>,
        /// Hourly prices over the last 7 days, oldest first; empty where the
        /// source has none.
        pub sparkline: Vec<f64>,
    }

    pub struct CryptoSnapshot {
        #[serde(default)]
        pub coins: Vec<CryptoCoin>,
        pub source: String,
        pub freshness: Freshness,
    }

    /// One point on a price chart: Unix seconds and US dollars. Seconds fit
    /// a `u32` until 2106, and keep the TypeScript side a plain number.
    pub struct CryptoPricePoint {
        pub time: u32,
        pub price: f64,
    }

    /// A coin's price over a span of days.
    pub struct CryptoChart {
        pub id: String,
        pub days: u32,
        pub points: Vec<CryptoPricePoint>,
        pub source: String,
        pub freshness: Freshness,
    }
}
