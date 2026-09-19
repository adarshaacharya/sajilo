//! The rest of a day's panchang: tithi, nakshatra, yoga and karana with the
//! times they end, the moon, the season, the Nepal Sambat date, and the
//! Chaughadiya. All computed, so every date in the calendar has them offline.
//!
//! The panchang is read at sunrise, as almanacs print it: the tithi of a day
//! is the one current when the sun comes up. Checked against Hamro Patro's
//! pages for 2083 (`fixtures/panchang/`), which follow the official Nepal
//! Panchanga Nirnayak Samiti calendar.

use chrono::{DateTime, Datelike, Duration, NaiveDate, Utc, Weekday};
use serde::{Deserialize, Serialize};

use super::astronomy::{
    elongation, moon_position, moon_rise_set, next_boundary, previous_boundary, sidereal,
    sun_longitude,
};
use crate::calendar::nepali_date::NepaliDate;
use crate::numerals::devanagari;

/// A named panchang element, in both languages, and when it gives way to the
/// next one (absent for things that last all day).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Named {
    pub index: u32,
    pub en: String,
    pub ne: String,
    pub ends: Option<DateTime<Utc>>,
}

impl Named {
    fn of(names: &[(&str, &str)], index: usize, ends: Option<DateTime<Utc>>) -> Self {
        let (en, ne) = names[index];
        Self {
            index: index as u32,
            en: en.to_owned(),
            ne: ne.to_owned(),
            ends,
        }
    }
}

const TITHIS: [(&str, &str); 15] = [
    ("Pratipada", "प्रतिपदा"),
    ("Dwitiya", "द्वितीया"),
    ("Tritiya", "तृतीया"),
    ("Chaturthi", "चतुर्थी"),
    ("Panchami", "पञ्चमी"),
    ("Shashthi", "षष्ठी"),
    ("Saptami", "सप्तमी"),
    ("Ashtami", "अष्टमी"),
    ("Navami", "नवमी"),
    ("Dashami", "दशमी"),
    ("Ekadashi", "एकादशी"),
    ("Dwadashi", "द्वादशी"),
    ("Trayodashi", "त्रयोदशी"),
    ("Chaturdashi", "चतुर्दशी"),
    ("Purnima", "पूर्णिमा"),
];
const AMAVASYA: (&str, &str) = ("Amavasya", "औंसी");

const PAKSHAS: [(&str, &str); 2] = [("Shukla", "शुक्ल"), ("Krishna", "कृष्ण")];

const NAKSHATRAS: [(&str, &str); 27] = [
    ("Ashwini", "अश्विनी"),
    ("Bharani", "भरणी"),
    ("Krittika", "कृत्तिका"),
    ("Rohini", "रोहिणी"),
    ("Mrigashira", "मृगशिरा"),
    ("Ardra", "आर्द्रा"),
    ("Punarvasu", "पुनर्वसु"),
    ("Pushya", "पुष्य"),
    ("Ashlesha", "आश्लेषा"),
    ("Magha", "मघा"),
    ("Purva Phalguni", "पूर्वफाल्गुनी"),
    ("Uttara Phalguni", "उत्तरफाल्गुनी"),
    ("Hasta", "हस्त"),
    ("Chitra", "चित्रा"),
    ("Swati", "स्वाती"),
    ("Vishakha", "विशाखा"),
    ("Anuradha", "अनुराधा"),
    ("Jyeshtha", "ज्येष्ठा"),
    ("Mula", "मूल"),
    ("Purva Ashadha", "पूर्वाषाढा"),
    ("Uttara Ashadha", "उत्तराषाढा"),
    ("Shravana", "श्रवण"),
    ("Dhanishtha", "धनिष्ठा"),
    ("Shatabhisha", "शतभिषा"),
    ("Purva Bhadrapada", "पूर्वभाद्रपद"),
    ("Uttara Bhadrapada", "उत्तरभाद्रपद"),
    ("Revati", "रेवती"),
];

const YOGAS: [(&str, &str); 27] = [
    ("Vishkambha", "विष्कम्भ"),
    ("Priti", "प्रीति"),
    ("Ayushman", "आयुष्मान्"),
    ("Saubhagya", "सौभाग्य"),
    ("Shobhana", "शोभन"),
    ("Atiganda", "अतिगण्ड"),
    ("Sukarma", "सुकर्मा"),
    ("Dhriti", "धृति"),
    ("Shula", "शूल"),
    ("Ganda", "गण्ड"),
    ("Vriddhi", "वृद्धि"),
    ("Dhruva", "ध्रुव"),
    ("Vyaghata", "व्याघात"),
    ("Harshana", "हर्षण"),
    ("Vajra", "वज्र"),
    ("Siddhi", "सिद्धि"),
    ("Vyatipata", "व्यतीपात"),
    ("Variyana", "वरीयान्"),
    ("Parigha", "परिघ"),
    ("Shiva", "शिव"),
    ("Siddha", "सिद्ध"),
    ("Sadhya", "साध्य"),
    ("Shubha", "शुभ"),
    ("Shukla", "शुक्ल"),
    ("Brahma", "ब्रह्म"),
    ("Indra", "ऐन्द्र"),
    ("Vaidhriti", "वैधृति"),
];

/// The seven karanas that repeat through the month, then the four fixed ones.
const KARANAS: [(&str, &str); 11] = [
    ("Bava", "बव"),
    ("Balava", "बालव"),
    ("Kaulava", "कौलव"),
    ("Taitila", "तैतिल"),
    ("Gara", "गर"),
    ("Vanija", "वणिज"),
    ("Vishti", "विष्टि"),
    ("Shakuni", "शकुनि"),
    ("Chatushpada", "चतुष्पद"),
    ("Naga", "नाग"),
    ("Kimstughna", "किंस्तुघ्न"),
];

const RASHIS: [(&str, &str); 12] = [
    ("Mesh", "मेष"),
    ("Brish", "वृष"),
    ("Mithun", "मिथुन"),
    ("Karkat", "कर्कट"),
    ("Simha", "सिंह"),
    ("Kanya", "कन्या"),
    ("Tula", "तुला"),
    ("Brischik", "वृश्चिक"),
    ("Dhanu", "धनु"),
    ("Makar", "मकर"),
    ("Kumbha", "कुम्भ"),
    ("Meen", "मीन"),
];

const RITUS: [(&str, &str); 6] = [
    ("Basanta (spring)", "वसन्त"),
    ("Grishma (summer)", "ग्रीष्म"),
    ("Barsha (monsoon)", "वर्षा"),
    ("Sharad (autumn)", "शरद्"),
    ("Hemanta (pre-winter)", "हेमन्त"),
    ("Shishir (winter)", "शिशिर"),
];

const AYANS: [(&str, &str); 2] = [("Uttarayan", "उत्तरायण"), ("Dakshinayan", "दक्षिणायन")];

const MOON_PHASES: [(&str, &str); 8] = [
    ("New moon", "औंसी"),
    ("Waxing crescent", "बढ्दो जून"),
    ("First quarter", "आधा जून, बढ्दो"),
    ("Waxing gibbous", "बढ्दो जून"),
    ("Full moon", "पूर्णिमा"),
    ("Waning gibbous", "घट्दो जून"),
    ("Last quarter", "आधा जून, घट्दो"),
    ("Waning crescent", "घट्दो जून"),
];

/// Nepal Sambat's lunar months, from the one that starts in Chaitra.
const NS_MONTHS: [&str; 12] = [
    "चौला",
    "बछला",
    "तछला",
    "दिल्ला",
    "गुंला",
    "ञंला",
    "कौला",
    "कछला",
    "थिंला",
    "पोहेला",
    "सिल्ला",
    "चिल्ला",
];
/// The month added in a year that has one extra.
const NS_LEAP_MONTH: &str = "अनाला";
const NS_TITHIS: [&str; 15] = [
    "पारू",
    "द्वितीया",
    "तृतिया",
    "चतुर्थी",
    "पञ्चमी",
    "षष्ठी",
    "सप्तमी",
    "अष्टमी",
    "नवमी",
    "दशमी",
    "एकादशी",
    "द्वादशी",
    "त्रयोदशी",
    "चतुर्दशी",
    "पुन्हि",
];
const NS_NEW_MOON: &str = "आमाइ";

const TITHI_SPAN: f64 = 12.0;
const STAR_SPAN: f64 = 360.0 / 27.0;

fn sidereal_moon(at: DateTime<Utc>) -> f64 {
    sidereal(moon_position(at).0, at)
}

fn sidereal_sun(at: DateTime<Utc>) -> f64 {
    sidereal(sun_longitude(at), at)
}

fn yoga_angle(at: DateTime<Utc>) -> f64 {
    (sidereal_moon(at) + sidereal_sun(at)).rem_euclid(360.0)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Moon {
    pub phase: Named,
    /// Share of the disc lit, 0–1.
    pub illumination: f64,
    /// True from new moon to full.
    pub waxing: bool,
    pub rashi: Named,
    pub rise: Option<DateTime<Utc>>,
    pub set: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Almanac {
    /// 1–30: Shukla Pratipada is 1, Purnima 15, Amavasya 30.
    pub tithi: Named,
    pub paksha: Named,
    pub nakshatra: Named,
    pub yoga: Named,
    pub karana: Named,
    pub moon: Moon,
    pub ritu: Named,
    pub ayan: Named,
    /// e.g. `११४६ गुंलाथ्व पुन्हि`.
    pub nepal_sambat: String,
}

/// The day's panchang, read at `sunrise`, for the BS date `bs`.
/// `day_start`/`day_end` bound the Nepal-local day for moonrise and moonset.
pub fn almanac(
    bs: NepaliDate,
    sunrise: DateTime<Utc>,
    day_start: DateTime<Utc>,
    day_end: DateTime<Utc>,
    latitude: f64,
    longitude: f64,
) -> Almanac {
    let angle = elongation(sunrise);
    let tithi_index = (angle / TITHI_SPAN).floor() as usize; // 0–29
    let tithi_ends = next_boundary(sunrise, TITHI_SPAN, elongation);
    let paksha = tithi_index / 15;
    let tithi_name = if tithi_index == 29 {
        AMAVASYA
    } else {
        TITHIS[tithi_index % 15]
    };

    let star = sidereal_moon(sunrise);
    let nakshatra_ends = next_boundary(sunrise, STAR_SPAN, sidereal_moon);
    let yoga_ends = next_boundary(sunrise, STAR_SPAN, yoga_angle);

    // Sixty half-tithis a month: the first and last three are fixed karanas,
    // the fifty-six between cycle through the seven movable ones.
    let half = (angle / (TITHI_SPAN / 2.0)).floor() as usize;
    let karana = match half {
        0 => 10,
        57 => 7,
        58 => 8,
        59 => 9,
        n => (n - 1) % 7,
    };
    let karana_ends = next_boundary(sunrise, TITHI_SPAN / 2.0, elongation);

    let (rise, set) = moon_rise_set(day_start, day_end, latitude, longitude);
    let illumination = (1.0 - angle.to_radians().cos()) / 2.0;

    Almanac {
        tithi: Named {
            index: tithi_index as u32 + 1,
            en: tithi_name.0.to_owned(),
            ne: tithi_name.1.to_owned(),
            ends: Some(tithi_ends),
        },
        paksha: Named::of(&PAKSHAS, paksha, None),
        nakshatra: Named::of(
            &NAKSHATRAS,
            (star / STAR_SPAN).floor() as usize % 27,
            Some(nakshatra_ends),
        ),
        yoga: Named::of(
            &YOGAS,
            (yoga_angle(sunrise) / STAR_SPAN).floor() as usize % 27,
            Some(yoga_ends),
        ),
        karana: Named::of(&KARANAS, karana, Some(karana_ends)),
        moon: Moon {
            phase: Named::of(&MOON_PHASES, moon_phase(angle), None),
            illumination,
            waxing: angle < 180.0,
            rashi: Named::of(&RASHIS, (star / 30.0).floor() as usize % 12, None),
            rise,
            set,
        },
        ritu: Named::of(&RITUS, ritu(bs.month), None),
        ayan: Named::of(&AYANS, ayan(bs.month), None),
        nepal_sambat: nepal_sambat(sunrise, tithi_index),
    }
}

/// Eight phases. The quarters and the full and new moon are the half-tithi
/// either side of the exact moment, so each lasts about a day as a calendar
/// shows it.
fn moon_phase(angle: f64) -> usize {
    const HALF_TITHI: f64 = 6.0;
    let near = |centre: f64| (angle - centre).abs() < HALF_TITHI;
    if !(HALF_TITHI..360.0 - HALF_TITHI).contains(&angle) {
        0
    } else if near(90.0) {
        2
    } else if near(180.0) {
        4
    } else if near(270.0) {
        6
    } else if angle < 90.0 {
        1
    } else if angle < 180.0 {
        3
    } else if angle < 270.0 {
        5
    } else {
        7
    }
}

/// Two BS months to a season, Chaitra–Baisakh being spring. BS months are
/// solar months, so this is exact rather than an approximation.
fn ritu(bs_month: u32) -> usize {
    (bs_month as usize % 12) / 2
}

/// Uttarayan runs from Makar Sankranti (Magh 1) to Karkat Sankranti
/// (Shrawan 1) — again the start of a BS month.
fn ayan(bs_month: u32) -> usize {
    usize::from((4..=9).contains(&bs_month))
}

/// Nepal Sambat: a lunar calendar whose months run new moon to new moon, each
/// named for the solar sign the sun is in when it begins. A month in which the
/// sun changes no sign is the year's extra month. The year turns with
/// Kachhala, the month after Tihar's new moon.
fn nepal_sambat(sunrise: DateTime<Utc>, tithi_index: usize) -> String {
    // The moon gains on the sun by at least ten degrees a day.
    let started = previous_boundary(sunrise, 360.0, 10.0, elongation);
    let ends = next_boundary(sunrise, 360.0, elongation);
    let sign = |at: DateTime<Utc>| (sidereal_sun(at) / 30.0).floor() as usize % 12;
    let leap = sign(started) == sign(ends);
    // Sun in Meen at the new moon: Chaitra's month.
    let month = (sign(started) + 1) % 12;

    let local = sunrise + Duration::minutes(345);
    let turned = matches!(month, 7..=9) && local.month() >= 10;
    let year = local.year() - if turned { 879 } else { 880 };

    let name = if leap {
        NS_LEAP_MONTH
    } else {
        NS_MONTHS[month]
    };
    let (paksha, day) = if tithi_index < 15 {
        ("थ्व", NS_TITHIS[tithi_index])
    } else if tithi_index == 29 {
        ("गा", NS_NEW_MOON)
    } else {
        ("गा", NS_TITHIS[tithi_index - 15])
    };
    format!("{} {name}{paksha} {day}", devanagari(year, None))
}

/// One of the sixteen Chaughadiya a day and night divide into.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chaughadiya {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub name: Named,
    /// `good`, `neutral` or `bad`.
    pub quality: String,
}

/// Udveg, Char, Labh, Amrit, Kaal, Shubh, Rog: the order every day walks.
const CHAUGHADIYA: [(&str, &str, &str); 7] = [
    ("Udveg", "उद्वेग", "bad"),
    ("Char", "चर", "neutral"),
    ("Labh", "लाभ", "good"),
    ("Amrit", "अमृत", "good"),
    ("Kaal", "काल", "bad"),
    ("Shubh", "शुभ", "good"),
    ("Rog", "रोग", "bad"),
];

/// Where in that order each weekday's first daytime part starts. Written out,
/// like Rahu Kaal's, and pinned to Hamro Patro's tables in the tests.
fn chaughadiya_start(weekday: Weekday) -> usize {
    match weekday {
        Weekday::Sun => 0,
        Weekday::Mon => 3,
        Weekday::Tue => 6,
        Weekday::Wed => 2,
        Weekday::Thu => 5,
        Weekday::Fri => 1,
        Weekday::Sat => 4,
    }
}

/// Eight equal parts from sunrise to sunset, then eight from sunset to the
/// next sunrise. The night carries on one step past where the day began.
pub fn chaughadiya(
    weekday: Weekday,
    sunrise: DateTime<Utc>,
    sunset: DateTime<Utc>,
    next_sunrise: DateTime<Utc>,
) -> (Vec<Chaughadiya>, Vec<Chaughadiya>) {
    let first = chaughadiya_start(weekday);
    let parts = |from: DateTime<Utc>, to: DateTime<Utc>, offset: usize| {
        let length = (to - from) / 8;
        (0..8)
            .map(|k| {
                let (en, ne, quality) = CHAUGHADIYA[(offset + k) % 7];
                Chaughadiya {
                    start: from + length * k as i32,
                    end: from + length * (k as i32 + 1),
                    name: Named {
                        index: ((offset + k) % 7) as u32,
                        en: en.to_owned(),
                        ne: ne.to_owned(),
                        ends: None,
                    },
                    quality: quality.to_owned(),
                }
            })
            .collect()
    };
    (
        parts(sunrise, sunset, first),
        parts(sunset, next_sunrise, first + 1),
    )
}

/// The first and last moments of a Nepal-local calendar day, in UTC.
pub fn nepal_day_bounds(day: NaiveDate) -> (DateTime<Utc>, DateTime<Utc>) {
    let start = day.and_hms_opt(0, 0, 0).expect("midnight").and_utc() - Duration::minutes(345);
    (start, start + Duration::days(1))
}
