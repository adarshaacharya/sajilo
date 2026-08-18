//! The four calculators. Every one delegates to `sajilo-core` — the frontend
//! never does a unit conversion itself, so there is one implementation of each
//! constant in the product.

use sajilo_core::tools::land::{self, HillArea, LandUnit, TeraiArea};
use sajilo_core::tools::units::{self, WeightUnit};
use sajilo_core::tools::{interest, vat};
use serde::Serialize;

#[tauri::command]
pub fn convert_land(value: f64, from: LandUnit, to: LandUnit) -> f64 {
    land::convert(value, from, to)
}

/// Land is quoted compound — "2-3-1-0" — not as a decimal, so both the parts
/// and the rendered string come back together.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LandBreakdown {
    pub hill: HillArea,
    pub hill_compact: String,
    pub terai: TeraiArea,
    pub terai_compact: String,
    pub square_feet: f64,
    pub square_metres: f64,
}

#[tauri::command]
pub fn land_breakdown(value: f64, from: LandUnit) -> LandBreakdown {
    let square_feet = land::convert(value, from, LandUnit::SquareFeet);
    let hill = land::hill_area(square_feet);
    let terai = land::terai_area(square_feet);
    LandBreakdown {
        hill_compact: hill.compact(),
        terai_compact: terai.compact(),
        hill,
        terai,
        square_feet,
        square_metres: land::convert(square_feet, LandUnit::SquareFeet, LandUnit::SquareMetre),
    }
}

#[tauri::command]
pub fn convert_weight(value: f64, from: WeightUnit, to: WeightUnit) -> f64 {
    units::convert(value, from, to)
}

#[tauri::command]
pub fn compute_vat(amount: f64, inclusive: bool) -> vat::VatBreakdown {
    if inclusive {
        vat::removing(amount, vat::VAT_RATE)
    } else {
        vat::adding(amount, vat::VAT_RATE)
    }
}

#[tauri::command]
pub fn compute_interest(
    principal: f64,
    annual_rate_percent: f64,
    years: f64,
) -> interest::InterestResult {
    interest::simple(principal, annual_rate_percent, years)
}

/// South Asian digit grouping — lakh and crore — which no `Intl` locale does.
#[tauri::command]
pub fn group_number(value: f64, fraction_digits: usize) -> String {
    units::grouped_decimal(value, fraction_digits)
}
