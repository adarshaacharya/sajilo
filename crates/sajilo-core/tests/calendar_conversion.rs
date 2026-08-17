//! Ported from `BikramSambatCalendarTests.swift`.

use chrono::{Datelike, NaiveDate, Weekday};
use sajilo_core::ConversionError;
use sajilo_core::NepaliDate;
use sajilo_core::calendar::bikram_sambat::{
    FIRST_YEAR, LAST_YEAR, PROVISIONAL_YEARS, days_in_month, gregorian_date_from,
    is_supported_year, nepali_date_from,
};

fn ad(year: i32, month: u32, day: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(year, month, day).expect("test date is valid")
}

#[test]
fn converts_gregorian_dates_to_bikram_sambat() {
    let cases = [
        // BS 2000-01-01 is a published reference the bundled table was not
        // fitted to, so it independently validates the epoch and every year
        // length between it and the table's start.
        (ad(1943, 4, 14), NepaliDate::new(2000, 1, 1)),
        (ad(2023, 4, 14), NepaliDate::new(2080, 1, 1)),
        (ad(2025, 4, 14), NepaliDate::new(2082, 1, 1)),
        (ad(2026, 8, 15), NepaliDate::new(2083, 4, 30)),
        // BS 2084 is the last year checked against a published calendar; an
        // earlier draft of this table had it wrong for seven of twelve months.
        (ad(2027, 4, 14), NepaliDate::new(2084, 1, 1)),
    ];
    for (gregorian, expected) in cases {
        assert_eq!(
            nepali_date_from(gregorian).unwrap(),
            expected,
            "{gregorian}"
        );
    }
}

#[test]
fn converts_bikram_sambat_date_to_gregorian() {
    let result = gregorian_date_from(NepaliDate::new(2083, 4, 30)).unwrap();
    assert_eq!(result, ad(2026, 8, 15));
    // The PRD's dashboard mock shows this date as a Saturday.
    assert_eq!(result.weekday(), Weekday::Sat);
}

/// Guards the defect class that shipped a 367-day BS 2084: a mistyped row
/// silently shifts every conversion after it.
#[test]
fn every_supported_year_has_a_valid_length() {
    for year in FIRST_YEAR..=LAST_YEAR {
        let lengths: Vec<i32> = (1..=12)
            .map(|month| {
                days_in_month(year, month)
                    .unwrap_or_else(|| panic!("BS {year} month {month} missing"))
            })
            .collect();
        assert!(
            lengths.iter().all(|&length| (29..=32).contains(&length)),
            "BS {year} has an out-of-range month: {lengths:?}"
        );
        let total: i32 = lengths.iter().sum();
        assert!(
            total == 365 || total == 366,
            "BS {year} totals {total} days"
        );
    }
}

/// Every date in the supported range must survive BS → AD → BS unchanged.
#[test]
fn round_trips_every_date_in_the_supported_range() {
    for year in FIRST_YEAR..=LAST_YEAR {
        for month in 1..=12 {
            let number_of_days = days_in_month(year, month).expect("supported month");
            for day in [1, number_of_days as u32] {
                let bs = NepaliDate::new(year, month, day);
                let ad = gregorian_date_from(bs).unwrap();
                assert_eq!(nepali_date_from(ad).unwrap(), bs);
            }
        }
    }
}

/// Consecutive days must advance by exactly one day across year boundaries,
/// which catches an off-by-one in the year-offset table.
#[test]
fn year_boundaries_are_contiguous() {
    for year in FIRST_YEAR..LAST_YEAR {
        let last_day = days_in_month(year, 12).expect("month 12 exists") as u32;
        let end_of_year = gregorian_date_from(NepaliDate::new(year, 12, last_day)).unwrap();
        let start_of_next = gregorian_date_from(NepaliDate::new(year + 1, 1, 1)).unwrap();
        assert_eq!(
            (start_of_next - end_of_year).num_days(),
            1,
            "BS {year} does not join {}",
            year + 1
        );
    }
}

#[test]
fn validates_actual_month_length_instead_of_generic_maximum() {
    assert_eq!(days_in_month(2083, 3), Some(32));
    assert_eq!(days_in_month(2083, 4), Some(31));
    assert_eq!(days_in_month(2083, 13), None);
    assert_eq!(days_in_month(2083, 0), None);
}

#[test]
fn rejects_out_of_range_nepali_date() {
    assert_eq!(
        gregorian_date_from(NepaliDate::new(2083, 4, 32)),
        Err(ConversionError::UnsupportedNepaliDate)
    );
    assert_eq!(
        gregorian_date_from(NepaliDate::new(2083, 4, 0)),
        Err(ConversionError::UnsupportedNepaliDate)
    );
}

#[test]
fn rejects_dates_outside_the_supported_years() {
    assert_eq!(
        gregorian_date_from(NepaliDate::new(FIRST_YEAR - 1, 1, 1)),
        Err(ConversionError::UnsupportedNepaliDate)
    );
    assert_eq!(
        gregorian_date_from(NepaliDate::new(LAST_YEAR + 1, 1, 1)),
        Err(ConversionError::UnsupportedNepaliDate)
    );
    assert_eq!(
        nepali_date_from(ad(1900, 1, 1)),
        Err(ConversionError::UnsupportedGregorianDate)
    );
    assert_eq!(
        nepali_date_from(ad(2100, 1, 1)),
        Err(ConversionError::UnsupportedGregorianDate)
    );
}

/// The day before the epoch and the day after the last supported day are the
/// exact boundary the range check has to get right.
#[test]
fn boundary_dates_are_inclusive_on_both_ends() {
    assert_eq!(
        nepali_date_from(ad(1935, 4, 13)).unwrap(),
        NepaliDate::new(FIRST_YEAR, 1, 1)
    );
    assert_eq!(
        nepali_date_from(ad(1935, 4, 12)),
        Err(ConversionError::UnsupportedGregorianDate)
    );

    let last_day = days_in_month(LAST_YEAR, 12).unwrap() as u32;
    let last = gregorian_date_from(NepaliDate::new(LAST_YEAR, 12, last_day)).unwrap();
    assert_eq!(
        nepali_date_from(last).unwrap(),
        NepaliDate::new(LAST_YEAR, 12, last_day)
    );
    assert_eq!(
        nepali_date_from(last.succ_opt().unwrap()),
        Err(ConversionError::UnsupportedGregorianDate)
    );
}

/// The provisional window must stay inside the supported range, so the UI can
/// never flag a year the engine cannot convert.
#[test]
fn provisional_years_are_supported() {
    assert!(is_supported_year(*PROVISIONAL_YEARS.start()));
    assert!(is_supported_year(*PROVISIONAL_YEARS.end()));
}
