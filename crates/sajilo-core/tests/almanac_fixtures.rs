//! The computed panchang against Hamro Patro's, which follows the official
//! Nepal Panchanga Nirnayak Samiti calendar. Recorded in
//! `fixtures/panchang/hamropatro-2083.json`: two days from every month of 2083.

use chrono::{DateTime, Duration, NaiveDate, NaiveTime, Utc};
use sajilo_core::calendar::almanac::Chaughadiya;
use sajilo_core::calendar::panchanga::panchanga_for;
use sajilo_core::nepal_time;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecordedDay {
    bs: String,
    ad: String,
    nepal_sambat: String,
    tithi: String,
    paksha: String,
    tithi_ends: String,
    nakshatra: String,
    nakshatra_ends: String,
    yoga: String,
    yoga_ends: String,
    karana: String,
    moon: String,
    chaughadiya_day: Vec<String>,
    chaughadiya_night: Vec<String>,
}

#[derive(Deserialize)]
struct Recording {
    days: Vec<RecordedDay>,
}

fn days() -> Vec<RecordedDay> {
    let text = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../fixtures/panchang/hamropatro-2083.json"
    ))
    .unwrap();
    serde_json::from_str::<Recording>(&text).unwrap().days
}

fn ad(day: &RecordedDay) -> NaiveDate {
    NaiveDate::parse_from_str(&day.ad, "%a, %b %e %Y").unwrap()
}

/// Hamro Patro's spellings of the names it writes differently from us.
fn ours(name: &str) -> &str {
    match name {
        "Nawami" => "Navami",
        "Aardra" => "Ardra",
        "Aaslesha" => "Ashlesha",
        "Dhanistha" => "Dhanishtha",
        "Moola" => "Mula",
        "Poorvaashadha" => "Purva Ashadha",
        "Uttaraashadha" => "Uttara Ashadha",
        "Bariyan" => "Variyana",
        "Bishkambha" => "Vishkambha",
        "Bramha" => "Brahma",
        "Briddhi" => "Vriddhi",
        "Ghriti" => "Dhriti",
        "Harshan" => "Harshana",
        "Parigh" => "Parigha",
        "Sobhan" => "Shobhana",
        "Sool" => "Shula",
        "Subha" => "Shubha",
        "Sukarman" => "Sukarma",
        "Baalav" => "Balava",
        "Gar" => "Gara",
        "Kaulav" => "Kaulava",
        "Taitil" => "Taitila",
        "Vanij" => "Vanija",
        "Vishti/Bhadraa" => "Vishti",
        "Kaala" => "Kaal",
        other => other,
    }
}

/// Minutes between our ending and Hamro Patro's. It prints a clock time with
/// no date, and an ending can fall after the next sunrise, so a whole day
/// either way counts as the same moment.
fn minutes_apart(ours: DateTime<Utc>, date: NaiveDate, theirs: &str) -> i64 {
    let time = NaiveTime::parse_from_str(theirs, "%l:%M %p").unwrap();
    let theirs = date
        .and_time(time)
        .and_local_timezone(nepal_time::offset())
        .unwrap()
        .with_timezone(&Utc);
    let gap = (ours - theirs).num_minutes().rem_euclid(1_440);
    gap.min(1_440 - gap)
}

/// Days where the official calendar names the day for a tithi other than the
/// one current at sunrise: 2083-04-05, where Saptami ends a quarter of an hour
/// after it, and the Ekadashi days 2083-08-05 and 2083-10-05, which follow
/// the rules for keeping the fast. The day's tithi comes from the bundled
/// official calendar; this module supplies the times.
const OFFICIAL_TITHI_DIFFERS: [&str; 3] = ["2083-04-05", "2083-08-05", "2083-10-05"];

/// Eight minutes: the moon and sun are good to a minute or two, the rest is
/// how each almanac rounds.
const MINUTES: i64 = 8;

#[test]
fn tithi_nakshatra_yoga_and_karana_match_the_official_almanac() {
    for day in days() {
        let date = ad(&day);
        let a = panchanga_for(date).unwrap().almanac.unwrap();
        let ends = |at: Option<DateTime<Utc>>, theirs: &str| {
            minutes_apart(at.unwrap(), date, theirs) <= MINUTES
        };

        if !OFFICIAL_TITHI_DIFFERS.contains(&day.bs.as_str()) {
            assert_eq!(a.tithi.en, ours(&day.tithi), "{} tithi", day.bs);
            assert_eq!(a.paksha.en, day.paksha, "{} paksha", day.bs);
        }
        assert!(ends(a.tithi.ends, &day.tithi_ends), "{} tithi ends", day.bs);
        assert_eq!(a.nakshatra.en, ours(&day.nakshatra), "{} nakshatra", day.bs);
        assert!(
            ends(a.nakshatra.ends, &day.nakshatra_ends),
            "{} nakshatra ends",
            day.bs
        );
        assert_eq!(a.yoga.en, ours(&day.yoga), "{} yoga", day.bs);
        assert!(ends(a.yoga.ends, &day.yoga_ends), "{} yoga ends", day.bs);
        assert_eq!(a.karana.en, ours(&day.karana), "{} karana", day.bs);
    }
}

/// Year and lunar month, the extra month of 2083 included, and fortnight.
#[test]
fn nepal_sambat_matches() {
    for day in days() {
        let a = panchanga_for(ad(&day)).unwrap().almanac.unwrap();
        let ours: Vec<&str> = a.nepal_sambat.split(' ').collect();
        let theirs: Vec<&str> = day.nepal_sambat.split(' ').collect();
        let year: String = ours[0]
            .chars()
            .map(|c| char::from_digit(c as u32 - '०' as u32, 10).unwrap())
            .collect();
        assert_eq!(year, theirs[0], "{} year", day.bs);
        assert_eq!(ours[1], theirs[1], "{} month", day.bs);
    }
}

/// A quarter is a day wide and almanacs draw its edges a little differently;
/// every other phase must agree.
#[test]
fn moon_phase_matches_within_a_quarter() {
    for day in days() {
        let a = panchanga_for(ad(&day)).unwrap().almanac.unwrap();
        let (ours, theirs) = (a.moon.phase.en.to_lowercase(), day.moon.to_lowercase());
        let quarter = ours.contains("quarter") || theirs.contains("quarter");
        assert!(
            ours == theirs || quarter,
            "{} moon {ours} / {theirs}",
            day.bs
        );
    }
}

#[test]
fn chaughadiya_follows_the_official_order() {
    let names = |parts: &[Chaughadiya]| parts.iter().map(|p| p.name.en.clone()).collect::<Vec<_>>();
    let theirs = |list: &[String]| list.iter().map(|n| ours(n).to_owned()).collect::<Vec<_>>();
    for day in days() {
        let reading = panchanga_for(ad(&day)).unwrap();
        assert_eq!(
            names(&reading.chaughadiya_day),
            theirs(&day.chaughadiya_day),
            "{} day",
            day.bs
        );
        assert_eq!(
            names(&reading.chaughadiya_night),
            theirs(&day.chaughadiya_night),
            "{} night",
            day.bs
        );
    }
}

/// Parts of the day are equal, run sunrise to sunset, and the night picks up
/// where the day ends.
#[test]
fn chaughadiya_covers_the_day_and_night_without_gaps() {
    let reading = panchanga_for(NaiveDate::from_ymd_opt(2026, 8, 28).unwrap()).unwrap();
    let (day, night) = (&reading.chaughadiya_day, &reading.chaughadiya_night);
    assert_eq!(day.first().unwrap().start, reading.sunrise);
    assert!(
        (day.last().unwrap().end - reading.sunset)
            .num_seconds()
            .abs()
            <= 1
    );
    assert_eq!(night.first().unwrap().start, day.last().unwrap().end);
    assert!(night.windows(2).all(|pair| pair[0].end == pair[1].start));
    assert!(night.last().unwrap().end - night.first().unwrap().start > Duration::hours(10));
}

/// Moonrise, moonset, the moon's sign, the season and the ayan, against
/// Ashesh's panchang for 19 September 2026 — Hamro Patro's page does not
/// print them.
#[test]
fn moon_sign_season_and_moonrise_match_ashesh() {
    let text = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../fixtures/panchang/ashesh-2026-09-19.json"
    ))
    .unwrap();
    let recorded: serde_json::Value = serde_json::from_str(&text).unwrap();
    let date = NaiveDate::from_ymd_opt(2026, 9, 19).unwrap();
    let a = panchanga_for(date).unwrap().almanac.unwrap();

    assert_eq!(a.moon.rashi.ne, recorded["chandraRashi"]);
    assert_eq!(a.ritu.ne, recorded["ritu"]);
    assert_eq!(a.ayan.ne, recorded["ayan"]);
    assert_eq!(a.tithi.ne, recorded["tithi"]);
    assert_eq!(a.nakshatra.ne, recorded["nakshatra"]);
    assert_eq!(a.karana.ne, recorded["karana"]);

    let clock = |at: DateTime<Utc>| {
        at.with_timezone(&nepal_time::offset())
            .format("%H:%M")
            .to_string()
    };
    let within = |ours: &str, theirs: &serde_json::Value, minutes: i64| {
        let parse = |t: &str| NaiveTime::parse_from_str(t, "%H:%M").unwrap();
        (parse(ours) - parse(theirs.as_str().unwrap()))
            .num_minutes()
            .abs()
            <= minutes
    };
    let rise = clock(a.moon.rise.unwrap());
    let set = clock(a.moon.set.unwrap());
    assert!(within(&rise, &recorded["moonrise"], 5), "moonrise {rise}");
    assert!(within(&set, &recorded["moonset"], 5), "moonset {set}");
}
