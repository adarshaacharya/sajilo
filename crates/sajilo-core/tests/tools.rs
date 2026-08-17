//! Ported from `LandConverterTests.swift` and `NepaliUnitsTests.swift`.

use sajilo_core::tools::land::{self, LandUnit};
use sajilo_core::tools::units::{self, WeightUnit, grouped, grouped_decimal, scale_description};
use sajilo_core::tools::{interest, vat};

const ALL_LAND_UNITS: [LandUnit; 9] = [
    LandUnit::Ropani,
    LandUnit::Aana,
    LandUnit::Paisa,
    LandUnit::Daam,
    LandUnit::Bigha,
    LandUnit::Kattha,
    LandUnit::Dhur,
    LandUnit::SquareFeet,
    LandUnit::SquareMetre,
];

const ALL_WEIGHT_UNITS: [WeightUnit; 4] = [
    WeightUnit::Tola,
    WeightUnit::Gram,
    WeightUnit::TenGram,
    WeightUnit::Ounce,
];

// ---------------------------------------------------------------- land

/// The two systems are defined by these subdivisions; if any drift, every
/// conversion downstream is wrong.
#[test]
fn subdivisions_are_exact() {
    assert_eq!(
        LandUnit::Ropani.square_feet(),
        16.0 * LandUnit::Aana.square_feet()
    );
    assert_eq!(
        LandUnit::Aana.square_feet(),
        4.0 * LandUnit::Paisa.square_feet()
    );
    assert_eq!(
        LandUnit::Paisa.square_feet(),
        4.0 * LandUnit::Daam.square_feet()
    );
    assert_eq!(
        LandUnit::Bigha.square_feet(),
        20.0 * LandUnit::Kattha.square_feet()
    );
    assert_eq!(
        LandUnit::Kattha.square_feet(),
        20.0 * LandUnit::Dhur.square_feet()
    );
}

/// One ropani is 74 ft square — the definition everything else divides from.
#[test]
fn ropani_is_seventy_four_feet_square() {
    assert_eq!(LandUnit::Ropani.square_feet(), 74.0 * 74.0);
    assert_eq!(LandUnit::Bigha.square_feet(), 72_900.0);
}

#[test]
fn converts_within_the_hill_system() {
    assert_eq!(land::convert(1.0, LandUnit::Ropani, LandUnit::Aana), 16.0);
    assert_eq!(land::convert(1.0, LandUnit::Ropani, LandUnit::Paisa), 64.0);
    assert_eq!(land::convert(1.0, LandUnit::Ropani, LandUnit::Daam), 256.0);
    assert_eq!(land::convert(16.0, LandUnit::Aana, LandUnit::Ropani), 1.0);
}

#[test]
fn converts_within_the_terai_system() {
    assert_eq!(land::convert(1.0, LandUnit::Bigha, LandUnit::Kattha), 20.0);
    assert_eq!(land::convert(1.0, LandUnit::Bigha, LandUnit::Dhur), 400.0);
    assert_eq!(land::convert(20.0, LandUnit::Kattha, LandUnit::Bigha), 1.0);
}

/// The systems are unrelated, so a cross conversion is the one people cannot do
/// in their head. 1 bigha ≈ 13.31 ropani.
#[test]
fn converts_between_the_two_systems() {
    // 72,900 / 5,476 = 13.31264…, the figure usually quoted as "13.31".
    let ropani = land::convert(1.0, LandUnit::Bigha, LandUnit::Ropani);
    assert!((ropani - 13.312_637).abs() < 0.000_01);

    let bigha = land::convert(ropani, LandUnit::Ropani, LandUnit::Bigha);
    assert!(
        (bigha - 1.0).abs() < 0.000_001,
        "the cross conversion must round trip"
    );
}

#[test]
fn converts_to_metric_and_imperial() {
    assert_eq!(
        land::convert(1.0, LandUnit::Ropani, LandUnit::SquareFeet),
        5476.0
    );
    let metres = land::convert(1.0, LandUnit::Ropani, LandUnit::SquareMetre);
    assert!((metres - 508.737).abs() < 0.01, "1 ropani ≈ 508.74 m²");
}

/// Land is quoted compound — "2-3-1-0" — not as a decimal.
#[test]
fn decomposes_into_the_quoted_hill_form() {
    let square_feet = 2.0 * 5476.0 + 3.0 * 342.25 + 85.5625;
    let area = land::hill_area(square_feet);

    assert_eq!(area.ropani, 2);
    assert_eq!(area.aana, 3);
    assert_eq!(area.paisa, 1);
    assert!(area.daam.abs() < 0.0001);
    assert_eq!(area.compact(), "2-3-1-0");
}

#[test]
fn decomposes_into_the_quoted_terai_form() {
    let square_feet = 72_900.0 + 5.0 * 3_645.0 + 7.0 * 182.25;
    let area = land::terai_area(square_feet);

    assert_eq!(area.bigha, 1);
    assert_eq!(area.kattha, 5);
    assert!((area.dhur - 7.0).abs() < 0.0001);
    assert_eq!(area.compact(), "1-5-7");
}

/// The residue below one daam is real land and must not be rounded away.
#[test]
fn keeps_the_remainder_below_the_smallest_unit() {
    let area = land::hill_area(5476.0 + 10.0);
    assert_eq!(area.ropani, 1);
    assert_eq!(area.aana, 0);
    assert!(area.daam > 0.0, "10 sq ft of remainder must survive");
}

#[test]
fn handles_zero_and_negative_input() {
    assert_eq!(land::hill_area(0.0).compact(), "0-0-0-0");
    assert_eq!(land::terai_area(-100.0).compact(), "0-0-0");
}

#[test]
fn round_trips_through_every_land_unit() {
    for unit in ALL_LAND_UNITS {
        let square_feet = land::convert(3.0, unit, LandUnit::SquareFeet);
        let back = land::convert(square_feet, LandUnit::SquareFeet, unit);
        assert!((back - 3.0).abs() < 0.000_001, "{unit:?} round trip");
        assert!(!unit.display_name().is_empty());
        assert!(!unit.nepali_name().is_empty());
    }
}

// -------------------------------------------------------------- weight

/// A tola is 3/8 of a troy ounce exactly. Jewellers quote 11.664 g; the exact
/// value is kept so large quantities do not drift.
#[test]
fn tola_is_three_eighths_of_a_troy_ounce() {
    assert!((WeightUnit::Tola.grams() - WeightUnit::Ounce.grams() * 3.0 / 8.0).abs() < 0.000_001);
    assert!((WeightUnit::Tola.grams() - 11.6638).abs() < 0.0001);
}

/// Gold is quoted per tola and per 10 g, so this is the conversion people
/// actually do at the counter.
#[test]
fn converts_tola_to_ten_gram() {
    let ten_grams = units::convert(1.0, WeightUnit::Tola, WeightUnit::TenGram);
    assert!((ten_grams - 1.16638).abs() < 0.0001);

    let tolas = units::convert(1.0, WeightUnit::TenGram, WeightUnit::Tola);
    assert!((tolas - 0.857_39).abs() < 0.0001);
}

#[test]
fn round_trips_every_weight_unit() {
    for unit in ALL_WEIGHT_UNITS {
        let grams = units::convert(7.5, unit, WeightUnit::Gram);
        assert!((units::convert(grams, WeightUnit::Gram, unit) - 7.5).abs() < 0.000_001);
        assert!(!unit.display_name().is_empty());
        assert!(!unit.nepali_name().is_empty());
    }
}

// ------------------------------------------------------------- finance

#[test]
fn adds_vat_to_a_quoted_price() {
    let result = vat::adding(1_000.0, vat::VAT_RATE);
    assert!((result.vat - 130.0).abs() < 0.000_001);
    assert!((result.total - 1_130.0).abs() < 0.000_001);
}

/// The common mistake: taking 13% *of the total* overstates the tax. On a
/// Rs 1,130 bill the VAT is 130, not 146.90.
#[test]
fn extracts_vat_from_an_inclusive_price() {
    let result = vat::removing(1_130.0, vat::VAT_RATE);
    assert!((result.base - 1_000.0).abs() < 0.000_001);
    assert!((result.vat - 130.0).abs() < 0.000_001);
    assert!(
        (result.vat - 1_130.0 * 0.13).abs() > 1.0,
        "must not be 13% of the total"
    );
}

#[test]
fn vat_round_trips() {
    let added = vat::adding(4_567.89, vat::VAT_RATE);
    let removed = vat::removing(added.total, vat::VAT_RATE);
    assert!((removed.base - 4_567.89).abs() < 0.000_001);
}

#[test]
fn uses_nepals_standard_rate() {
    assert_eq!(vat::VAT_RATE, 0.13);
}

#[test]
fn computes_simple_interest() {
    let result = interest::simple(100_000.0, 12.0, 2.0);
    assert!((result.interest - 24_000.0).abs() < 0.000_001);
    assert!((result.total - 124_000.0).abs() < 0.000_001);
}

#[test]
fn handles_fractional_terms() {
    let half_year = interest::simple(50_000.0, 10.0, 0.5);
    assert!((half_year.interest - 2_500.0).abs() < 0.000_001);

    let zero = interest::simple(50_000.0, 0.0, 3.0);
    assert_eq!(zero.interest, 0.0);
    assert_eq!(zero.total, 50_000.0);
}

// ---------------------------------------------------------- formatting

/// Uniform three-digit grouping would render this as 12,500,000. South Asian
/// grouping is what makes lakh and crore readable.
#[test]
fn groups_in_the_south_asian_style() {
    let cases = [
        (100, "100"),
        (1_000, "1,000"),
        (10_000, "10,000"),
        (100_000, "1,00,000"),
        (1_000_000, "10,00,000"),
        (12_500_000, "1,25,00,000"),
        (1_234_567_890, "1,23,45,67,890"),
    ];
    for (value, expected) in cases {
        assert_eq!(grouped(value), expected);
    }
}

#[test]
fn handles_zero_and_negatives() {
    assert_eq!(grouped(0), "0");
    assert_eq!(grouped(-100_000), "-1,00,000");
}

#[test]
fn preserves_published_market_decimals() {
    assert_eq!(grouped_decimal(722.90, 2), "722.90");
    assert_eq!(grouped_decimal(4_275_675_402.84, 2), "4,27,56,75,402.84");
    assert_eq!(grouped_decimal(-20.70, 2), "-20.70");
    // A value inside (-1, 0) has an integer part of zero and must keep its sign.
    assert_eq!(grouped_decimal(-0.5, 2), "-0.50");
}

#[test]
fn describes_the_scale_as_it_is_spoken() {
    assert_eq!(
        scale_description(12_500_000).as_deref(),
        Some("1 crore 25 lakh")
    );
    assert_eq!(scale_description(500_000).as_deref(), Some("5 lakh"));
    assert_eq!(scale_description(10_000_000).as_deref(), Some("1 crore"));
}

/// Below a lakh there is no scale word to add, so it stays silent rather than
/// saying "0 lakh".
#[test]
fn omits_the_scale_below_a_lakh() {
    assert_eq!(scale_description(99_999), None);
    assert_eq!(scale_description(0), None);
}
