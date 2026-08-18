//! Reads only from `fixtures/hamropatro/`.

use chrono::{TimeZone, Utc};
use sajilo_api::rashifal::RashiSign;
use sajilo_providers::hamropatro;

const FIXTURE: &str = include_str!("../../../fixtures/hamropatro/rashifal.html");

fn parsed() -> sajilo_api::rashifal::RashifalSnapshot {
    hamropatro::parse(FIXTURE, Utc.timestamp_opt(1_800_000_000, 0).unwrap())
        .expect("fixture parses")
}

#[test]
fn decodes_a_reading_for_every_sign() {
    let snapshot = parsed();
    assert_eq!(snapshot.readings.len(), 12);
    for sign in RashiSign::ALL {
        let reading = snapshot.reading(sign).expect("every sign is read");
        assert!(!reading.prediction.is_empty(), "{sign:?}");
    }
}

/// The reading is someone's writing, carried verbatim — never trimmed,
/// summarised or reflowed.
#[test]
fn carries_the_prose_verbatim() {
    let snapshot = parsed();
    let mesh = snapshot.reading(RashiSign::Mesh).unwrap();
    assert!(
        mesh.prediction.starts_with("संगीत वा कलाको क्षेत्रमा"),
        "got: {}",
        mesh.prediction
    );
    assert!(
        mesh.prediction.ends_with("।"),
        "the sentence must not be clipped"
    );
}

/// Each sign must get its own paragraph, not a neighbour's.
#[test]
fn does_not_repeat_one_reading_across_signs() {
    let snapshot = parsed();
    let mut predictions: Vec<&str> = snapshot
        .readings
        .iter()
        .map(|r| r.prediction.as_str())
        .collect();
    predictions.sort_unstable();
    predictions.dedup();
    assert_eq!(predictions.len(), 12, "every sign has a distinct reading");
}

/// The short syllable line that follows each heading must never be mistaken for
/// the reading.
#[test]
fn skips_the_short_label_before_the_paragraph() {
    for reading in &parsed().readings {
        assert!(
            reading.prediction.chars().count() >= 60,
            "{:?} got a label, not a reading: {}",
            reading.sign,
            reading.prediction
        );
        // "चु, चे, चो, ला" — the name-syllable line is commas and single letters.
        assert!(
            !reading.prediction.starts_with("चु, चे"),
            "{:?} picked up the syllable line",
            reading.sign
        );
    }
}

/// All twelve or nothing: a partial page means the markup moved, and showing
/// four signs while silently dropping eight is worse than saying so.
#[test]
fn refuses_a_partial_page() {
    let now = Utc.timestamp_opt(0, 0).unwrap();
    assert!(hamropatro::parse("<html><body>down</body></html>", now).is_err());

    let partial = "<div><span>मेष</span><p>\
        संगीत वा कलाको क्षेत्रमा आफन्तहरूको साथ मिल्नाले मन प्रसन्न र आनन्दित रहनेछ। \
        व्यापार व्यवसायलाई लिएर गरिएको यात्राबाट सफलता प्राप्त हुनेछ।</p></div>";
    let error = hamropatro::parse(partial, now).unwrap_err();
    assert!(error.to_string().contains("1 of 12"), "{error}");
    assert!(!error.is_retryable(), "a markup change never retries away");
}
