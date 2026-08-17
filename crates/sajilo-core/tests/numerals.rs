//! Ported from `NepaliNumeralsTests.swift` and the pure half of
//! `NumeralStyleTests.swift` (the rest exercises `AppModel`, not this crate).

use sajilo_core::NepaliDate;
use sajilo_core::numerals::{NumeralStyle, ascii, devanagari, to_ascii_digits};

#[test]
fn converts_arabic_digits_to_nepali_digits() {
    for (input, expected) in [(0, "०"), (7, "७"), (30, "३०"), (2083, "२०८३")] {
        assert_eq!(devanagari(input, None), expected);
    }
}

#[test]
fn pads_then_converts_digits() {
    assert_eq!(devanagari(4, Some(2)), "०४");
    assert_eq!(ascii(4, Some(2)), "04");
}

#[test]
fn converts_nepali_digits_back_to_arabic_digits() {
    assert_eq!(to_ascii_digits("२०८३/०४/३०"), "2083/04/30");
    // Non-digits pass through untouched.
    assert_eq!(to_ascii_digits("साउन २०८३"), "साउन 2083");
}

#[test]
fn renders_both_digit_systems() {
    assert_eq!(NumeralStyle::Devanagari.format(2083, None), "२०८३");
    assert_eq!(NumeralStyle::Latin.format(2083, None), "2083");
    assert_eq!(NumeralStyle::Devanagari.format(4, Some(2)), "०४");
    assert_eq!(NumeralStyle::Latin.format(4, Some(2)), "04");
}

#[test]
fn formats_a_slashed_date() {
    let date = NepaliDate::new(2083, 4, 31);
    assert_eq!(NumeralStyle::Devanagari.slashed_date(date), "२०८३/०४/३१");
    assert_eq!(NumeralStyle::Latin.slashed_date(date), "2083/04/31");
    assert_eq!(date.nepali_numerals(), "२०८३/०४/३१");
}

#[test]
fn defaults_to_devanagari() {
    assert_eq!(NumeralStyle::default(), NumeralStyle::Devanagari);
}

/// Month names stay Devanagari either way — this is a numeral setting, not a
/// translation.
#[test]
fn month_names_carry_both_scripts() {
    let date = NepaliDate::new(2083, 4, 1);
    assert_eq!(date.nepali_month_name(), "साउन");
    assert_eq!(date.english_month_name(), "Shrawan");
    for month in 1..=12 {
        let date = NepaliDate::new(2083, month, 1);
        assert!(!date.nepali_month_name().is_empty());
        assert!(!date.english_month_name().is_empty());
    }
    // Out-of-range months name nothing rather than panicking.
    assert_eq!(NepaliDate::new(2083, 13, 1).nepali_month_name(), "");
}
