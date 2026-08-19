//! Nepal's two land systems plus metric and imperial. Ported from
//! `LandConverter.swift`.
//!
//! The hill system (ropani–aana–paisa–daam) and the Terai system
//! (bigha–kattha–dhur) are unrelated to each other; both are defined here in
//! square feet, the only unit they share exactly. Every constant is exact
//! rather than rounded — one ropani is 74 ft × 74 ft, and the rest divide down
//! from there without remainder.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LandUnit {
    // Hill system, used across the Kathmandu Valley and the hills.
    Ropani,
    Aana,
    Paisa,
    Daam,
    // Terai system.
    Bigha,
    Kattha,
    Dhur,
    // Everything else.
    SquareFeet,
    SquareMetre,
}

pub const HILL_SYSTEM: [LandUnit; 4] = [
    LandUnit::Ropani,
    LandUnit::Aana,
    LandUnit::Paisa,
    LandUnit::Daam,
];
pub const TERAI_SYSTEM: [LandUnit; 3] = [LandUnit::Bigha, LandUnit::Kattha, LandUnit::Dhur];

impl LandUnit {
    /// One of this unit, in square feet.
    pub fn square_feet(self) -> f64 {
        match self {
            Self::Ropani => 5476.0,   // 74 ft × 74 ft
            Self::Aana => 342.25,     // ropani / 16
            Self::Paisa => 85.5625,   // aana / 4
            Self::Daam => 21.390_625, // paisa / 4
            Self::Bigha => 72_900.0,  // 20 kattha
            Self::Kattha => 3_645.0,  // bigha / 20
            Self::Dhur => 182.25,     // kattha / 20
            Self::SquareFeet => 1.0,
            Self::SquareMetre => 10.763_910_4,
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::Ropani => "Ropani",
            Self::Aana => "Aana",
            Self::Paisa => "Paisa",
            Self::Daam => "Daam",
            Self::Bigha => "Bigha",
            Self::Kattha => "Kattha",
            Self::Dhur => "Dhur",
            Self::SquareFeet => "sq ft",
            Self::SquareMetre => "m²",
        }
    }

    pub fn nepali_name(self) -> &'static str {
        match self {
            Self::Ropani => "रोपनी",
            Self::Aana => "आना",
            Self::Paisa => "पैसा",
            Self::Daam => "दाम",
            Self::Bigha => "बिघा",
            Self::Kattha => "कठ्ठा",
            Self::Dhur => "धुर",
            Self::SquareFeet => "वर्ग फिट",
            Self::SquareMetre => "वर्ग मिटर",
        }
    }
}

pub fn convert(value: f64, from: LandUnit, to: LandUnit) -> f64 {
    value * from.square_feet() / to.square_feet()
}

/// Land is quoted as a compound figure — "2-3-1-0" means 2 ropani, 3 aana,
/// 1 paisa, 0 daam — so a single decimal is rarely what anyone wants.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct HillArea {
    pub ropani: i64,
    pub aana: i64,
    pub paisa: i64,
    pub daam: f64,
}

impl HillArea {
    /// The form used on deeds and in listings.
    pub fn compact(&self) -> String {
        format!(
            "{}-{}-{}-{}",
            self.ropani,
            self.aana,
            self.paisa,
            format_residue(self.daam)
        )
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct TeraiArea {
    pub bigha: i64,
    pub kattha: i64,
    pub dhur: f64,
}

impl TeraiArea {
    pub fn compact(&self) -> String {
        format!(
            "{}-{}-{}",
            self.bigha,
            self.kattha,
            format_residue(self.dhur)
        )
    }
}

/// Takes as many whole `unit`s as fit, and reports what is left over.
fn take_whole(remaining: &mut f64, unit: LandUnit) -> i64 {
    let count = (*remaining / unit.square_feet()) as i64;
    *remaining -= count as f64 * unit.square_feet();
    count
}

pub fn hill_area(square_feet: f64) -> HillArea {
    let mut remaining = square_feet.max(0.0);
    HillArea {
        ropani: take_whole(&mut remaining, LandUnit::Ropani),
        aana: take_whole(&mut remaining, LandUnit::Aana),
        paisa: take_whole(&mut remaining, LandUnit::Paisa),
        // Daam is the smallest unit, so the remainder stays fractional rather
        // than being rounded away — that residue is real land.
        daam: remaining / LandUnit::Daam.square_feet(),
    }
}

pub fn terai_area(square_feet: f64) -> TeraiArea {
    let mut remaining = square_feet.max(0.0);
    TeraiArea {
        bigha: take_whole(&mut remaining, LandUnit::Bigha),
        kattha: take_whole(&mut remaining, LandUnit::Kattha),
        dhur: remaining / LandUnit::Dhur.square_feet(),
    }
}

/// Whole numbers read as whole numbers; a residue keeps two places.
fn format_residue(value: f64) -> String {
    if value.round() == value {
        format!("{}", value as i64)
    } else {
        format!("{value:.2}")
    }
}
