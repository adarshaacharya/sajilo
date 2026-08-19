use serde::{Deserialize, Serialize};

/// A Bikram Sambat calendar date. Ordering is lexicographic on
/// (year, month, day), matching `NepaliDate: Comparable` in Swift.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct NepaliDate {
    pub year: i32,
    pub month: u32,
    pub day: u32,
}

impl NepaliDate {
    pub fn new(year: i32, month: u32, day: u32) -> Self {
        Self { year, month, day }
    }

    pub fn nepali_month_name(&self) -> &'static str {
        NepaliMonth::from_number(self.month).map_or("", NepaliMonth::nepali_name)
    }

    pub fn english_month_name(&self) -> &'static str {
        NepaliMonth::from_number(self.month).map_or("", NepaliMonth::english_name)
    }

    /// `२०८२/०४/०१` — the slashed Devanagari form used across the UI.
    pub fn nepali_numerals(&self) -> String {
        use crate::numerals::devanagari;
        format!(
            "{}/{}/{}",
            devanagari(self.year, None),
            devanagari(i64::from(self.month), Some(2)),
            devanagari(i64::from(self.day), Some(2))
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NepaliMonth {
    Baishakh = 1,
    Jestha,
    Asar,
    Shrawan,
    Bhadra,
    Ashwin,
    Kartik,
    Mangsir,
    Poush,
    Magh,
    Falgun,
    Chaitra,
}

const NEPALI_NAMES: [&str; 12] = [
    "बैशाख",
    "जेठ",
    "असार",
    "साउन",
    "भदौ",
    "असोज",
    "कार्तिक",
    "मंसिर",
    "पुष",
    "माघ",
    "फागुन",
    "चैत",
];

const ENGLISH_NAMES: [&str; 12] = [
    "Baishakh", "Jestha", "Asar", "Shrawan", "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush",
    "Magh", "Falgun", "Chaitra",
];

impl NepaliMonth {
    pub const ALL: [Self; 12] = [
        Self::Baishakh,
        Self::Jestha,
        Self::Asar,
        Self::Shrawan,
        Self::Bhadra,
        Self::Ashwin,
        Self::Kartik,
        Self::Mangsir,
        Self::Poush,
        Self::Magh,
        Self::Falgun,
        Self::Chaitra,
    ];

    pub fn all() -> [Self; 12] {
        Self::ALL
    }

    pub fn from_number(month: u32) -> Option<Self> {
        use NepaliMonth::*;
        Some(match month {
            1 => Baishakh,
            2 => Jestha,
            3 => Asar,
            4 => Shrawan,
            5 => Bhadra,
            6 => Ashwin,
            7 => Kartik,
            8 => Mangsir,
            9 => Poush,
            10 => Magh,
            11 => Falgun,
            12 => Chaitra,
            _ => return None,
        })
    }

    pub fn number(self) -> u32 {
        self as u32
    }

    pub fn nepali_name(self) -> &'static str {
        NEPALI_NAMES[self.number() as usize - 1]
    }

    pub fn from_nepali_name(name: &str) -> Option<Self> {
        NEPALI_NAMES
            .iter()
            .position(|&candidate| candidate == name)
            .and_then(|index| Self::from_number(index as u32 + 1))
    }

    pub fn english_name(self) -> &'static str {
        ENGLISH_NAMES[self.number() as usize - 1]
    }
}
