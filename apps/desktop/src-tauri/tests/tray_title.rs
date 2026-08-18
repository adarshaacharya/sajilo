//! The tray label and its midnight rollover.

use chrono::{FixedOffset, TimeZone};
use sajilo_core::NepaliDate;
use sajilo_core::numerals::NumeralStyle;
use sajilo_desktop_lib::tray::title::{
    CustomMenuBar, MenuBarFormat, seconds_until_nepal_midnight, title,
};

fn date() -> NepaliDate {
    NepaliDate::new(2083, 4, 31)
}

fn render(format: MenuBarFormat, numerals: NumeralStyle) -> String {
    title(date(), format, numerals, CustomMenuBar::default())
}

#[test]
fn renders_every_menu_bar_format() {
    let devanagari = NumeralStyle::Devanagari;
    assert_eq!(render(MenuBarFormat::NepaliShort, devanagari), "साउन ३१");
    assert_eq!(
        render(MenuBarFormat::NepaliLong, devanagari),
        "साउन ३१, २०८३"
    );
    assert_eq!(
        render(MenuBarFormat::Numeric, devanagari),
        "२०८३/०४/३१"
    );
    assert_eq!(
        render(MenuBarFormat::NepaliFlag, devanagari),
        "🇳🇵 साउन ३१"
    );
    assert_eq!(
        title(
            date(),
            MenuBarFormat::Custom,
            devanagari,
            CustomMenuBar {
                show_flag: true,
                show_year: true,
            },
        ),
        "🇳🇵 ३१ साउन २०८३"
    );
    assert_eq!(
        title(
            date(),
            MenuBarFormat::Custom,
            NumeralStyle::Latin,
            CustomMenuBar {
                show_flag: false,
                show_year: false,
            },
        ),
        "31 साउन"
    );
}

/// The numeral setting changes digits only. Month names stay Devanagari — it is
/// a numeral preference, not a translation.
#[test]
fn the_numeral_style_changes_digits_but_not_names() {
    let latin = render(MenuBarFormat::NepaliLong, NumeralStyle::Latin);
    let devanagari = render(MenuBarFormat::NepaliLong, NumeralStyle::Devanagari);

    assert_ne!(latin, devanagari);
    assert!(latin.contains("2083"));
    assert!(devanagari.contains("२०८३"));
    assert!(latin.contains("साउन"), "the month name stays Devanagari");

    assert_eq!(
        render(MenuBarFormat::Numeric, NumeralStyle::Latin),
        "2083/04/31"
    );
}

/// `EnglishShort` is Latin by definition, so the numeral preference must not
/// touch it.
#[test]
fn the_english_format_ignores_the_numeral_setting() {
    let a = render(MenuBarFormat::EnglishShort, NumeralStyle::Devanagari);
    let b = render(MenuBarFormat::EnglishShort, NumeralStyle::Latin);
    assert_eq!(a, b);
    // BS 2083-04-31 is 16 August 2026.
    assert_eq!(a, "Aug 16");
}

/// Outside the bundled range there is no Gregorian date to render, so it falls
/// back to something true rather than to an empty menu bar.
#[test]
fn an_unconvertible_date_still_renders_something() {
    let outside = NepaliDate::new(3000, 1, 1);
    let label = title(
        outside,
        MenuBarFormat::EnglishShort,
        NumeralStyle::Latin,
        CustomMenuBar::default(),
    );
    assert!(!label.is_empty());
    assert_eq!(label, "Baishakh");
}

/// The tray rolls over at Kathmandu midnight, not the machine's. Tested by
/// moving the clock rather than waiting for it.
#[test]
fn counts_down_to_nepal_midnight() {
    let nepal = FixedOffset::east_opt(5 * 3600 + 45 * 60).unwrap();

    let just_after_midnight = nepal.with_ymd_and_hms(2026, 8, 16, 0, 0, 1).unwrap();
    assert_eq!(seconds_until_nepal_midnight(just_after_midnight), 86_399);

    let midday = nepal.with_ymd_and_hms(2026, 8, 16, 12, 0, 0).unwrap();
    assert_eq!(seconds_until_nepal_midnight(midday), 43_200);

    let a_minute_before = nepal.with_ymd_and_hms(2026, 8, 16, 23, 59, 0).unwrap();
    assert_eq!(seconds_until_nepal_midnight(a_minute_before), 60);
}

/// A zero-length wait would spin the timer at exactly midnight.
#[test]
fn the_wait_is_never_zero() {
    let nepal = FixedOffset::east_opt(5 * 3600 + 45 * 60).unwrap();
    let midnight = nepal.with_ymd_and_hms(2026, 8, 16, 0, 0, 0).unwrap();
    assert!(seconds_until_nepal_midnight(midnight) > 0);
}

/// Rolling past midnight must advance the label by exactly one day.
#[test]
fn the_label_advances_by_one_day_at_midnight() {
    use sajilo_core::calendar::bikram_sambat::{gregorian_date_from, nepali_date_from};

    let before = date();
    let next = nepali_date_from(gregorian_date_from(before).unwrap().succ_opt().unwrap()).unwrap();

    let a = title(
        before,
        MenuBarFormat::NepaliLong,
        NumeralStyle::Latin,
        CustomMenuBar::default(),
    );
    let b = title(
        next,
        MenuBarFormat::NepaliLong,
        NumeralStyle::Latin,
        CustomMenuBar::default(),
    );
    assert_ne!(a, b);
    assert!(b.contains("2083"));
}
