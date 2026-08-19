//! Nepal Rastra Bank exchange rates. Ported from `ForexSnapshot.swift`.

use std::collections::BTreeMap;

use chrono::{DateTime, NaiveDate, Utc};

use crate::load_state::Freshness;

dto! {
    /// One currency's buy/sell rate as published by NRB.
    pub struct ForexRate {
        pub currency_code: String,
        pub currency_name: String,
        /// How many units of the currency the quote covers. NRB quotes INR per
        /// 100, JPY per 10 and KRW per 100; treating those as per-1 misprices
        /// them by two orders of magnitude.
        pub unit: u32,
        /// NPR paid for `unit` of this currency.
        pub buy: f64,
        /// NPR charged for `unit` of this currency.
        pub sell: f64,
    }

    pub struct ForexSnapshot {
        pub rates: Vec<ForexRate>,
        /// Buy rate per currency across the requested window, oldest first.
        ///
        /// The provider already asks NRB for a date range so a non-publishing
        /// day falls back to rates still in force; keeping the rest of that
        /// response is enough for a trend line at no extra request cost.
        #[serde(default)]
        pub history: BTreeMap<String, Vec<f64>>,
        /// The date the rates apply to.
        pub date: NaiveDate,
        /// NRB's own publish and revise timestamps — PRD §5.5 requires showing
        /// the source's time, not only when Sajilo fetched it.
        pub published_on: Option<DateTime<Utc>>,
        pub modified_on: Option<DateTime<Utc>>,
        pub freshness: Freshness,
    }
}

impl ForexRate {
    pub fn buy_per_unit(&self) -> f64 {
        if self.unit > 0 {
            self.buy / f64::from(self.unit)
        } else {
            self.buy
        }
    }

    pub fn sell_per_unit(&self) -> f64 {
        if self.unit > 0 {
            self.sell / f64::from(self.unit)
        } else {
            self.sell
        }
    }

    /// "USD" or "JPY (per 10)", so a quote is never silently per-something-else.
    pub fn unit_label(&self) -> String {
        if self.unit == 1 {
            self.currency_code.clone()
        } else {
            format!("{} (per {})", self.currency_code, self.unit)
        }
    }

    /// NPR for a given amount of this currency, at the bank's buy rate.
    pub fn npr(&self, amount: f64) -> f64 {
        amount * self.buy_per_unit()
    }

    /// How much of this currency a given number of rupees buys, at the sell
    /// rate — the direction a customer actually pays.
    pub fn amount_for_npr(&self, rupees: f64) -> f64 {
        let sell = self.sell_per_unit();
        if sell > 0.0 { rupees / sell } else { 0.0 }
    }
}

impl ForexSnapshot {
    pub fn rate(&self, currency_code: &str) -> Option<&ForexRate> {
        self.rates
            .iter()
            .find(|rate| rate.currency_code == currency_code)
    }

    /// A trend needs at least three points and some movement; a flat or short
    /// series would draw a meaningless straight line.
    pub fn trend(&self, currency_code: &str) -> Option<&[f64]> {
        let series = self.history.get(currency_code)?;
        if series.len() < 3 {
            return None;
        }
        let low = series.iter().copied().fold(f64::INFINITY, f64::min);
        let high = series.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        (high > low).then_some(series.as_slice())
    }

    /// The most recent timestamp the source gives.
    ///
    /// Not simply "modified, else published": NRB's `modified_on` can predate
    /// `published_on` — the 16 Aug rates carry a 14 Aug modification — so
    /// preferring it outright would show a two-day-old time against today's
    /// rates. Whichever is later is the honest answer.
    pub fn source_timestamp(&self) -> Option<DateTime<Utc>> {
        [self.published_on, self.modified_on]
            .into_iter()
            .flatten()
            .max()
    }
}

/// PRD §5.5 default favourites.
pub const DEFAULT_FAVOURITES: [&str; 5] = ["USD", "AUD", "GBP", "EUR", "JPY"];

/// Offered in Settings. NRB publishes 22; these are the ones worth a toggle
/// rather than a wall of switches.
pub const SELECTABLE: [&str; 12] = [
    "USD", "EUR", "GBP", "AUD", "JPY", "INR", "CAD", "AED", "QAR", "SAR", "KRW", "MYR",
];

pub fn currency_name(code: &str) -> &str {
    match code {
        "USD" => "US Dollar",
        "EUR" => "Euro",
        "GBP" => "Pound Sterling",
        "AUD" => "Australian Dollar",
        "JPY" => "Japanese Yen",
        "INR" => "Indian Rupee",
        "CAD" => "Canadian Dollar",
        "AED" => "UAE Dirham",
        "QAR" => "Qatari Riyal",
        "SAR" => "Saudi Riyal",
        "KRW" => "Korean Won",
        "MYR" => "Malaysian Ringgit",
        other => other,
    }
}
