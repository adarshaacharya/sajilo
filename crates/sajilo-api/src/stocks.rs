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

    pub struct StockMarketSnapshot {
        pub nepse: Option<MarketIndex>,
        #[serde(default)]
        pub sub_indices: Vec<MarketIndex>,
        #[serde(default)]
        pub movers: Vec<MarketMover>,
        pub quotes: Vec<StockQuote>,
        pub freshness: Freshness,
    }
}
