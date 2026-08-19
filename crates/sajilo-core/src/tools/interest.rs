//! Simple interest. Ported from `FinanceCalculator` in `NepaliUnits.swift`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct InterestResult {
    pub principal: f64,
    pub interest: f64,
    pub total: f64,
}

/// `P × R × T / 100`, with the rate as a percent per year.
pub fn simple(principal: f64, annual_rate_percent: f64, years: f64) -> InterestResult {
    let interest = principal * annual_rate_percent * years / 100.0;
    InterestResult {
        principal,
        interest,
        total: principal + interest,
    }
}
