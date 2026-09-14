//! NEPSE quotes from ShareSansar. Ported from `StockMarketSnapshot.swift`.

use crate::load_state::Freshness;

dto_enum! {
    /// One of the four leaderboards on ShareSansar's market page.
    pub enum MoverBoard {
        Gainers,
        Losers,
        Turnover,
        Volume,
    }
}

dto! {
    /// One row from ShareSansar's public price table.
    pub struct StockQuote {
        pub symbol: String,
        pub company_name: Option<String>,
        pub ltp: f64,
        pub previous_close: f64,
        pub change: f64,
        pub change_percent: f64,
        pub open: Option<f64>,
        pub high: Option<f64>,
        pub low: Option<f64>,
        pub close: Option<f64>,
        pub vwap: Option<f64>,
        pub volume: Option<f64>,
        pub turnover: f64,
        pub transactions: Option<f64>,
        pub week52_high: Option<f64>,
        pub week52_low: Option<f64>,
        pub average120_day: Option<f64>,
        pub average180_day: Option<f64>,
    }

    /// NEPSE itself or one of its sector sub-indices.
    pub struct MarketIndex {
        pub name: String,
        pub value: f64,
        pub change: f64,
        pub change_percent: f64,
        pub turnover: f64,
    }

    /// A row from one of the market page's four leaderboards.
    pub struct MarketMover {
        pub board: MoverBoard,
        pub symbol: String,
        pub ltp: f64,
        /// Percent for gainers/losers; rupees or shares for the other two.
        pub metric: f64,
    }

    /// NEPSE's own open/closed flag, read separately from the price snapshot
    /// so the UI never has to infer it from prices or the calendar.
    pub struct MarketStatus {
        pub is_open: bool,
        /// When the exchange last opened or closed; while closed, the end of
        /// the last trading session.
        #[serde(default)]
        pub as_of: Option<chrono::DateTime<chrono::Utc>>,
    }

    /// How many traded companies closed up, down, or level on the day.
    pub struct MarketBreadth {
        pub advanced: u32,
        pub declined: u32,
        pub unchanged: u32,
    }

    pub struct StockMarketSnapshot {
        pub nepse: Option<MarketIndex>,
        pub market_status: Option<MarketStatus>,
        /// Counted from the price table, so it always agrees with the quotes.
        #[serde(default)]
        pub breadth: Option<MarketBreadth>,
        #[serde(default)]
        pub sub_indices: Vec<MarketIndex>,
        #[serde(default)]
        pub movers: Vec<MarketMover>,
        pub quotes: Vec<StockQuote>,
        pub freshness: Freshness,
    }
}
