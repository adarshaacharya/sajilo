//! Devanagari ↔ ASCII digits. Ported from `NepaliNumerals` and `NumeralStyle`.

use serde::{Deserialize, Serialize};

use crate::calendar::nepali_date::NepaliDate;

const DIGITS: [char; 10] = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

/// Render `value` in Devanagari digits, optionally zero-padded to `width`.
pub fn devanagari(value: impl Into<i64>, width: Option<usize>) -> String {
    map_digits(&ascii(value, width), |digit| DIGITS[digit])
}

/// Render `value` in ASCII digits, optionally zero-padded to `width`.
pub fn ascii(value: impl Into<i64>, width: Option<usize>) -> String {
    match width {
        Some(width) => format!("{:0width$}", value.into(), width = width),
        None => value.into().to_string(),
    }
}

/// Devanagari digits back to ASCII. Non-digit characters pass through, matching
/// `NepaliNumerals.arabicString(from:)`.
pub fn to_ascii_digits(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            DIGITS
                .iter()
                .position(|&d| d == character)
                .map_or(character, |digit| {
                    char::from_digit(digit as u32, 10).expect("0..9 is a valid digit")
                })
        })
        .collect()
}

fn map_digits(source: &str, f: impl Fn(usize) -> char) -> String {
    source
        .chars()
        .map(|character| {
            character
                .to_digit(10)
                .map_or(character, |digit| f(digit as usize))
        })
        .collect()
}

/// Which digits Bikram Sambat dates are drawn with. Not a translation setting —
/// month and weekday names stay Devanagari either way.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NumeralStyle {
    #[default]
    Devanagari,
    Latin,
}

impl NumeralStyle {
    pub fn format(self, value: impl Into<i64>, width: Option<usize>) -> String {
        match self {
            Self::Devanagari => devanagari(value, width),
            Self::Latin => ascii(value, width),
        }
    }

    /// `2083/04/31` in the chosen digits.
    pub fn slashed_date(self, date: NepaliDate) -> String {
        format!(
            "{}/{}/{}",
            self.format(date.year, None),
            self.format(i64::from(date.month), Some(2)),
            self.format(i64::from(date.day), Some(2))
        )
    }
}
