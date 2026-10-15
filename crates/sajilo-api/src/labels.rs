//! Dates as the screens show them, worked out in Rust: the frontend never
//! computes a BS date.

use chrono::NaiveDate;
use sajilo_core::NepaliDate;

/// `कात्तिक ३` or `Kartik 3`, with the year only when it isn't `today`'s.
pub fn bs_label(date: NepaliDate, today: NepaliDate, nepali: bool) -> String {
    use sajilo_core::numerals::devanagari;
    let this_year = today.year == date.year;
    match (nepali, this_year) {
        (true, true) => format!(
            "{} {}",
            date.nepali_month_name(),
            devanagari(date.day, None)
        ),
        (true, false) => format!(
            "{} {}, {}",
            date.nepali_month_name(),
            devanagari(date.day, None),
            devanagari(date.year, None)
        ),
        (false, true) => format!("{} {}", date.english_month_name(), date.day),
        (false, false) => format!("{} {}, {}", date.english_month_name(), date.day, date.year),
    }
}

/// The same for an AD date. `None` outside the BS table.
pub fn bs_label_of(date: NaiveDate, today: NepaliDate, nepali: bool) -> Option<String> {
    sajilo_core::calendar::bikram_sambat::nepali_date_from(date)
        .ok()
        .map(|bs| bs_label(bs, today, nepali))
}
