//! Current public issues published by CDSC.

use crate::load_state::Freshness;

dto! {
    /// One row from CDSC's server-rendered Current Issue Update table.
    pub struct IpoIssue {
        /// The cell exactly as CDSC publishes it, e.g.
        /// `Beni Hydropower Project Limited - BENI (IPO - For General Public)`.
        pub company_name: String,
        /// The company alone, without symbol or issue description. The whole
        /// cell when it does not follow CDSC's usual shape.
        #[serde(default)]
        pub name: String,
        #[serde(default)]
        pub symbol: Option<String>,
        /// `IPO`, `FPO`, `Right Share`, … as CDSC words it.
        #[serde(default)]
        pub issue_type: Option<String>,
        /// Who may apply, e.g. `General Public`, without CDSC's leading "For".
        #[serde(default)]
        pub audience: Option<String>,
        pub issue_manager: String,
        /// Kept as source text: CDSC publishes whole units, often with separators.
        pub issued_units: String,
        pub application_count: String,
        pub applied_units: String,
        pub amount: String,
        /// ISO `YYYY-MM-DD`, as published by CDSC.
        pub open_date: String,
        /// ISO `YYYY-MM-DD`, as published by CDSC.
        pub close_date: String,
        pub last_update: String,
    }

    pub struct IpoSnapshot {
        #[serde(default)]
        pub issues: Vec<IpoIssue>,
        pub freshness: Freshness,
    }
}
