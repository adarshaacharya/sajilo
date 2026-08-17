//! Weight units used for gold and silver in Nepal, plus South Asian digit
//! grouping. Ported from `NepaliUnits.swift`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WeightUnit {
    Tola,
    Gram,
    TenGram,
    Ounce,
}

impl WeightUnit {
    /// One of this unit, in grams.
    ///
    /// The tola is 3/8 of a troy ounce exactly — 11.6638038 g. Nepali jewellers
    /// quote 11.664 g; the exact value is kept here so a large quantity does not
    /// drift, and rounding happens once at display.
    pub fn grams(self) -> f64 {
        match self {
            Self::Tola => 11.663_803_8,
            Self::Gram => 1.0,
            Self::TenGram => 10.0,
            // Troy ounce, the unit bullion is priced in.
            Self::Ounce => 31.103_476_8,
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::Tola => "Tola",
            Self::Gram => "Gram",
            Self::TenGram => "10 g",
            Self::Ounce => "Troy ounce",
        }
    }

    pub fn nepali_name(self) -> &'static str {
        match self {
            Self::Tola => "तोला",
            Self::Gram => "ग्राम",
            Self::TenGram => "१० ग्राम",
            Self::Ounce => "ट्रोय औंस",
        }
    }
}

pub fn convert(value: f64, from: WeightUnit, to: WeightUnit) -> f64 {
    value * from.grams() / to.grams()
}

/// South Asian digit grouping — thousand, then lakh, then crore.
///
/// Uniform three-digit grouping cannot do this: 1,25,00,000 would come out as
/// 12,500,000. The difference matters because rates, budgets and property
/// prices in Nepal are all read in lakh and crore.
pub fn grouped(value: i64) -> String {
    let sign = if value < 0 { "-" } else { "" };
    let digits = value.unsigned_abs().to_string();
    if digits.len() <= 3 {
        return format!("{sign}{digits}");
    }

    // The last three digits stay together; everything above them is split into
    // pairs, which is what produces lakh and crore.
    let (head, tail) = digits.split_at(digits.len() - 3);
    let head: Vec<char> = head.chars().collect();
    let mut groups: Vec<String> = Vec::new();
    let mut end = head.len();
    while end > 2 {
        groups.push(head[end - 2..end].iter().collect());
        end -= 2;
    }
    groups.push(head[..end].iter().collect());
    groups.reverse();
    groups.push(tail.to_owned());

    format!("{sign}{}", groups.join(","))
}

/// Market feeds publish prices to two decimal places. Keep that precision: a
/// quoted LTP of 722.90 must never become the materially different 723.
pub fn grouped_decimal(value: f64, fraction_digits: usize) -> String {
    let formatted = format!("{value:.*}", fraction_digits);
    let (whole, fraction) = match formatted.split_once('.') {
        Some((whole, fraction)) => (whole, Some(fraction)),
        None => (formatted.as_str(), None),
    };
    let Ok(whole) = whole.parse::<i64>() else {
        return formatted;
    };
    // A value in (-1, 0) parses its integer part as 0 and loses the sign.
    let sign = if value < 0.0 && whole == 0 { "-" } else { "" };
    match fraction {
        Some(fraction) if fraction_digits > 0 => {
            format!("{sign}{}.{fraction}", grouped(whole))
        }
        _ => format!("{sign}{}", grouped(whole)),
    }
}

/// "1 crore 25 lakh" — how the figure is actually said aloud.
pub fn scale_description(value: i64) -> Option<String> {
    let magnitude = value.unsigned_abs();
    if magnitude < 100_000 {
        return None;
    }

    let crore = magnitude / 10_000_000;
    let lakh = (magnitude % 10_000_000) / 100_000;
    let mut parts: Vec<String> = Vec::new();
    if crore > 0 {
        parts.push(format!("{crore} crore"));
    }
    if lakh > 0 {
        parts.push(format!("{lakh} lakh"));
    }
    (!parts.is_empty()).then(|| parts.join(" "))
}
