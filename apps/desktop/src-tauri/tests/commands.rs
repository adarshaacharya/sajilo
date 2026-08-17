//! The calendar commands are plain functions, so the half of the IPC surface
//! that does not need a running app is tested directly here.

use sajilo_desktop_lib::commands::calendar;

#[test]
fn today_resolves_in_nepal_not_the_local_zone() {
    let today = calendar::today().expect("today is inside the bundled range");

    assert!(today.nepali.year >= 2082, "got {}", today.nepali.year);
    assert!((1..=12).contains(&today.nepali.month));
    assert!((1..=32).contains(&today.nepali.day));
    assert!(!today.nepali_month_name.is_empty());
    assert!(!today.english_month_name.is_empty());
    assert!(today.weekday < 7);
    // ISO, so the frontend never needs a second calendar to read it.
    assert_eq!(today.gregorian.len(), 10);
}

#[test]
fn the_month_grid_is_padded_and_complete() {
    let grid = calendar::month_grid(2083, 4).expect("a supported month");

    let leading = grid
        .days
        .iter()
        .take_while(|day| day.date.is_none())
        .count();
    assert_eq!(grid.days.len(), leading + 31, "Shrawan 2083 has 31 days");
    assert!(grid.days[leading..].iter().all(|day| day.date.is_some()));
}

#[test]
fn an_unsupported_month_is_an_error_not_a_wrong_grid() {
    assert!(calendar::month_grid(3000, 1).is_err());
    assert!(calendar::month_grid(2083, 13).is_err());
}

/// The round trip is the property that matters: a date entered in either
/// direction must come back unchanged.
#[test]
fn the_converter_round_trips() {
    let forward = calendar::bs_to_ad(2083, 4, 30).expect("a real BS date");
    assert_eq!(forward.gregorian, "2026-08-15");

    let parts: Vec<u32> = forward
        .gregorian
        .split('-')
        .map(|p| p.parse().unwrap())
        .collect();
    let back = calendar::ad_to_bs(parts[0] as i32, parts[1], parts[2]).expect("a real AD date");
    assert_eq!(back.nepali, forward.nepali);
}

#[test]
fn the_converter_rejects_impossible_input() {
    // 31 February is not a date in any calendar.
    assert!(calendar::ad_to_bs(2026, 2, 31).is_err());
    assert!(calendar::ad_to_bs(2026, 13, 1).is_err());
    // Day 32 exists in some BS months but not this one.
    assert!(calendar::bs_to_ad(2083, 4, 32).is_err());
    // Outside the bundled table entirely.
    assert!(calendar::ad_to_bs(1800, 1, 1).is_err());
}

#[test]
fn shifting_months_crosses_a_year_boundary() {
    let next = calendar::shift_month(2083, 12, 1).expect("BS 2084 is supported");
    assert_eq!((next.year, next.month), (2084, 1));

    let previous = calendar::shift_month(2083, 1, -1).expect("BS 2082 is supported");
    assert_eq!((previous.year, previous.month), (2082, 12));

    // Past the end of the table is an error, not a silent clamp.
    assert!(calendar::shift_month(2090, 12, 1).is_err());
}

#[test]
fn events_are_returned_for_a_day_that_has_one() {
    let event = calendar::events_for(2083, 4, 1).expect("Shrawan 1 carries a festival");
    assert!(event.name.is_some());
    assert!(event.tithi.is_some());

    // A year outside the bundled festival data yields nothing rather than a
    // fabricated blank.
    assert!(calendar::events_for(2090, 1, 1).is_none());
}

#[test]
fn upcoming_events_respect_their_bounds() {
    let events = calendar::upcoming_events(Some(3), Some(400)).expect("today is convertible");
    assert!(events.len() <= 3);
    assert!(events.iter().all(|event| event.days_away >= 0));
}

/// The UI bounds its pickers from this, so it must match the engine rather than
/// being a second hand-written copy.
#[test]
fn the_supported_range_matches_the_engine() {
    use sajilo_core::calendar::bikram_sambat::{FIRST_YEAR, LAST_YEAR};
    use sajilo_core::calendar::events::{FIRST_EVENT_YEAR, LAST_EVENT_YEAR};

    let range = calendar::supported_range();
    assert_eq!(range.first_year, FIRST_YEAR);
    assert_eq!(range.last_year, LAST_YEAR);
    assert_eq!(range.first_event_year, FIRST_EVENT_YEAR);
    assert_eq!(range.last_event_year, LAST_EVENT_YEAR);
}

// ------------------------------------------------------------------ tools
//
// The Tools screen is a thin shell over these: it renders what they return and
// computes nothing itself, so testing them is testing the screen's arithmetic.

use sajilo_core::tools::land::LandUnit;
use sajilo_core::tools::units::WeightUnit;
use sajilo_desktop_lib::commands::tools;

/// Land is quoted compound on deeds, so the breakdown is the answer people
/// actually want — not a decimal.
#[test]
fn the_land_breakdown_matches_the_quoted_form() {
    let result = tools::land_breakdown(1.0, LandUnit::Ropani);

    assert_eq!(result.hill_compact, "1-0-0-0");
    assert_eq!(result.square_feet, 5476.0);
    assert!((result.square_metres - 508.737).abs() < 0.01);

    // 2 ropani 3 aana 1 paisa, expressed in aana, must decompose back.
    let aana = 2.0 * 16.0 + 3.0 + 0.25;
    let compound = tools::land_breakdown(aana, LandUnit::Aana);
    assert_eq!(compound.hill_compact, "2-3-1-0");
}

/// One bigha is about 13.31 ropani — the cross-system figure nobody can do in
/// their head, which is the whole reason this tool exists.
#[test]
fn converts_between_the_two_land_systems() {
    let ropani = tools::convert_land(1.0, LandUnit::Bigha, LandUnit::Ropani);
    assert!((ropani - 13.312_637).abs() < 0.000_01);
}

#[test]
fn converts_gold_weights_at_the_counter() {
    // A tola in 10-gram units, which is how gold is quoted two ways at once.
    let ten_gram = tools::convert_weight(1.0, WeightUnit::Tola, WeightUnit::TenGram);
    assert!((ten_gram - 1.16638).abs() < 0.0001);
}

/// Taking 13% *of the total* is the common mistake and overstates the tax. On a
/// Rs 1,130 bill the VAT is 130, not 146.90.
#[test]
fn vat_is_extracted_correctly_from_an_inclusive_price() {
    let inclusive = tools::compute_vat(1_130.0, true);
    assert!((inclusive.base - 1_000.0).abs() < 0.01);
    assert!((inclusive.vat - 130.0).abs() < 0.01);

    let exclusive = tools::compute_vat(1_000.0, false);
    assert!((exclusive.total - 1_130.0).abs() < 0.01);

    // The two directions must round-trip, or the checkbox lies.
    let round_trip = tools::compute_vat(exclusive.total, true);
    assert!((round_trip.base - 1_000.0).abs() < 0.01);
}

#[test]
fn computes_simple_interest_including_fractional_terms() {
    let two_years = tools::compute_interest(100_000.0, 12.0, 2.0);
    assert!((two_years.interest - 24_000.0).abs() < 0.01);
    assert!((two_years.total - 124_000.0).abs() < 0.01);

    // Quarter-year steps are what the UI offers.
    let half = tools::compute_interest(50_000.0, 10.0, 0.5);
    assert!((half.interest - 2_500.0).abs() < 0.01);
}

/// Lakh and crore grouping, which no `Intl` locale produces — the reason the UI
/// asks Rust to format these rather than doing it in JavaScript.
#[test]
fn groups_figures_the_way_they_are_read_in_nepal() {
    assert_eq!(tools::group_number(12_500_000.0, 2), "1,25,00,000.00");
    assert_eq!(tools::group_number(722.90, 2), "722.90");
    assert_eq!(tools::group_number(-20.70, 2), "-20.70");
}
