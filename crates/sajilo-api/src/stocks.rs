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

    /// One sample of an index during a session.
    pub struct IndexPoint {
        pub time: chrono::DateTime<chrono::Utc>,
        pub value: f64,
    }

    /// A figure reported for a fiscal year (and quarter), as NEPSE sites give
    /// them: `10.81` for `FY:082-083, Q:4`.
    pub struct ReportedFigure {
        pub value: f64,
        /// The period as the source writes it, e.g. `FY 082/83 · Q4`; empty
        /// when none is given.
        pub period: String,
    }

    /// What a company is worth and pays, from Merolagani's company page.
    /// Every figure may be missing: a newly listed company has no EPS yet, a
    /// mutual fund no book value.
    pub struct StockFundamentals {
        pub symbol: String,
        pub sector: Option<String>,
        pub shares_outstanding: Option<f64>,
        pub market_cap: Option<f64>,
        pub eps: Option<ReportedFigure>,
        pub pe_ratio: Option<f64>,
        pub book_value: Option<f64>,
        pub pbv: Option<f64>,
        /// Cash dividend and bonus share, percent of paid-up value.
        pub cash_dividend: Option<ReportedFigure>,
        pub bonus_share: Option<ReportedFigure>,
        pub right_share: Option<String>,
        /// Price change over the last year, percent.
        pub one_year_yield: Option<f64>,
        pub average_volume_30_day: Option<f64>,
        pub paid_up_value: Option<f64>,
        pub source: String,
        pub freshness: Freshness,
    }

    /// One point on a share's chart: a moment and the price then.
    pub struct StockChartPoint {
        /// Seconds since 1970, UTC. A trade's own moment for a session's
        /// chart; midnight UTC of the trading day for longer ranges.
        pub time: u32,
        pub price: f64,
        pub volume: f64,
    }

    /// A share's price over a range, oldest first.
    pub struct StockChart {
        pub symbol: String,
        /// `1d` (the latest session, trade by trade), `1w`, `1m`, `3m`, `1y`
        /// or `5y` (one close per trading day).
        pub range: String,
        pub points: Vec<StockChartPoint>,
        pub source: String,
        pub freshness: Freshness,
    }

    /// NEPSE through its latest session, a sample a minute, oldest first.
    pub struct IndexIntraday {
        #[serde(default)]
        pub points: Vec<IndexPoint>,
        pub freshness: Freshness,
    }
}
