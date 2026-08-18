//! Bikram Sambat ↔ Gregorian conversion.
//!
//! Ported from `BikramSambatCalendar.swift`. The month-length table below was
//! copied mechanically from the Swift source, not retyped.

use chrono::{Duration, NaiveDate};

use crate::calendar::nepali_date::NepaliDate;
use crate::error::{ConversionError, Result};

/// BS 1992–2090, roughly AD 1935–2034.
pub const FIRST_YEAR: i32 = 1992;
pub const LAST_YEAR: i32 = 2090;

/// Nepal's Panchanga Nirnayak Samiti publishes the official calendar only about
/// a year ahead. Every year through BS 2084 was checked against a published
/// calendar month by month; BS 2085 onward was not, and the source datasets
/// genuinely disagree there. Re-verify each against the official calendar as it
/// is published, and extend the supported range only with the same check.
pub const PROVISIONAL_YEARS: std::ops::RangeInclusive<i32> = 2085..=2090;

/// 1992-01-01 BS = 1935-04-13 AD, cross-checked against an independent
/// published reference (2000-01-01 BS = 1943-04-14 AD).
fn epoch() -> NaiveDate {
    NaiveDate::from_ymd_opt(1935, 4, 13).expect("epoch is a valid date")
}

/// Month lengths in days, one row per year from `FIRST_YEAR`. Bikram Sambat
/// months run 29–32 days with no closed-form rule, so this is bundled data
/// rather than something computed.
const MONTH_LENGTHS: [[i32; 12]; 99] = [
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 1992
    [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 1993
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 1994
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 1995
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 1996
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 1997
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 1998
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 1999
    [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2000
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2001
    [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2002
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2003
    [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2004
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2005
    [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2006
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2007
    [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31], // 2008
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2009
    [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2010
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2011
    [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], // 2012
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2013
    [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2014
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2015
    [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], // 2016
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2017
    [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2018
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2019
    [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 2020
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2021
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 2022
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2023
    [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 2024
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2025
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2026
    [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2027
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2028
    [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30], // 2029
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2030
    [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2031
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2032
    [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2033
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2034
    [30, 32, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31], // 2035
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2036
    [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2037
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2038
    [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], // 2039
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2040
    [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2041
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2042
    [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], // 2043
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2044
    [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2045
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2046
    [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 2047
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2048
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 2049
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2050
    [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 2051
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2052
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 2053
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2054
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2055
    [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30], // 2056
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2057
    [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2058
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2059
    [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2060
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2061
    [30, 32, 31, 32, 31, 31, 29, 30, 29, 30, 29, 31], // 2062
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2063
    [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2064
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2065
    [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31], // 2066
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2067
    [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2068
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2069
    [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], // 2070
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2071
    [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2072
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2073
    [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 2074
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2075
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 2076
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2077
    [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 2078
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2079
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 2080
    [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2081
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2082
    [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2083
    [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30], // 2084
    [31, 32, 31, 32, 30, 31, 30, 30, 29, 30, 30, 30], // 2085
    [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30], // 2086
    [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30], // 2087
    [30, 31, 32, 32, 30, 31, 30, 30, 29, 30, 30, 30], // 2088
    [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30], // 2089
    [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30], // 2090
];

/// Days elapsed from the epoch to the first day of each supported year, so a
/// conversion is one pass over a single year rather than a re-summation of the
/// whole table.
fn year_start_offsets() -> &'static [i32; 99] {
    use std::sync::OnceLock;
    static OFFSETS: OnceLock<[i32; 99]> = OnceLock::new();
    OFFSETS.get_or_init(|| {
        let mut offsets = [0i32; 99];
        let mut total = 0;
        for (index, lengths) in MONTH_LENGTHS.iter().enumerate() {
            offsets[index] = total;
            total += lengths.iter().sum::<i32>();
        }
        offsets
    })
}

fn total_days() -> i32 {
    year_start_offsets()[98] + MONTH_LENGTHS[98].iter().sum::<i32>()
}

pub fn is_supported_year(year: i32) -> bool {
    (FIRST_YEAR..=LAST_YEAR).contains(&year)
}

fn month_lengths(year: i32) -> Result<&'static [i32; 12]> {
    if !is_supported_year(year) {
        return Err(ConversionError::UnsupportedNepaliDate);
    }
    Ok(&MONTH_LENGTHS[(year - FIRST_YEAR) as usize])
}

/// Days in a BS month, or `None` when the year or month is out of range.
pub fn days_in_month(year: i32, month: u32) -> Option<i32> {
    let lengths = month_lengths(year).ok()?;
    lengths.get(month.checked_sub(1)? as usize).copied()
}

fn is_valid(date: NepaliDate) -> bool {
    match days_in_month(date.year, date.month) {
        Some(days) => (1..=days as u32).contains(&date.day),
        None => false,
    }
}

/// Gregorian → Bikram Sambat.
pub fn nepali_date_from(gregorian: NaiveDate) -> Result<NepaliDate> {
    let day_offset = (gregorian - epoch()).num_days();
    if day_offset < 0 || day_offset >= i64::from(total_days()) {
        return Err(ConversionError::UnsupportedGregorianDate);
    }
    let day_offset = day_offset as i32;

    // The last year whose start is at or before the target.
    let offsets = year_start_offsets();
    let year_index = offsets.partition_point(|&start| start <= day_offset) - 1;

    let mut remaining = day_offset - offsets[year_index];
    for (month_index, &length) in MONTH_LENGTHS[year_index].iter().enumerate() {
        if remaining < length {
            return Ok(NepaliDate {
                year: FIRST_YEAR + year_index as i32,
                month: month_index as u32 + 1,
                day: remaining as u32 + 1,
            });
        }
        remaining -= length;
    }
    Err(ConversionError::UnsupportedGregorianDate)
}

/// Bikram Sambat → Gregorian.
pub fn gregorian_date_from(date: NepaliDate) -> Result<NaiveDate> {
    if !is_valid(date) {
        return Err(ConversionError::UnsupportedNepaliDate);
    }
    let lengths = month_lengths(date.year)?;
    let day_offset = year_start_offsets()[(date.year - FIRST_YEAR) as usize]
        + lengths[..(date.month - 1) as usize].iter().sum::<i32>()
        + date.day as i32
        - 1;
    Ok(epoch() + Duration::days(i64::from(day_offset)))
}

/// The first day of the month `amount` months away, as the Swift version does:
/// day-of-month is dropped, not clamped.
pub fn adding_months(amount: i32, to: NepaliDate) -> Result<NepaliDate> {
    let month_index = to.year * 12 + (to.month as i32 - 1) + amount;
    let year = month_index.div_euclid(12);
    let month = month_index.rem_euclid(12) as u32 + 1;
    if !is_supported_year(year) {
        return Err(ConversionError::UnsupportedNepaliDate);
    }
    Ok(NepaliDate {
        year,
        month,
        day: 1,
    })
}
