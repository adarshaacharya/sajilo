//! Nepal's VAT, worked out on a phone calculator several times a week.
//! Ported from `FinanceCalculator` in `NepaliUnits.swift`.

use serde::{Deserialize, Serialize};

/// Nepal's standard VAT rate.
pub const VAT_RATE: f64 = 0.13;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct VatBreakdown {
    pub base: f64,
    pub vat: f64,
    pub total: f64,
}

/// A price quoted *before* VAT.
pub fn adding(base: f64, rate: f64) -> VatBreakdown {
    let vat = base * rate;
    VatBreakdown {
        base,
        vat,
        total: base + vat,
    }
}

/// A price that already includes VAT.
///
/// Not `total × 0.13` — that is the common mistake and overstates the tax. The
/// base is `total / 1.13`, and the VAT is what remains.
pub fn removing(total: f64, rate: f64) -> VatBreakdown {
    let base = total / (1.0 + rate);
    VatBreakdown {
        base,
        vat: total - base,
        total,
    }
}
