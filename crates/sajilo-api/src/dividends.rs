//! Declared dividends whose book closure is still ahead.

use crate::load_state::Freshness;

dto! {
    /// One company's declared dividend. The book closure is the date that
    /// matters to a holder: whoever holds the share on it receives the payout.
    pub struct BookClosure {
        pub symbol: String,
        #[serde(default)]
        pub company_name: String,
        /// Bonus shares, as a percent of the holding.
        pub bonus_percent: f64,
        /// Cash, as a percent of face value.
        pub cash_percent: f64,
        /// ISO `YYYY-MM-DD`, a Nepal calendar day.
        pub book_closure_date: String,
        /// e.g. `2082/2083`.
        #[serde(default)]
        pub fiscal_year: Option<String>,
    }

    pub struct DividendSnapshot {
        /// Soonest first.
        #[serde(default)]
        pub closures: Vec<BookClosure>,
        pub freshness: Freshness,
    }
}
