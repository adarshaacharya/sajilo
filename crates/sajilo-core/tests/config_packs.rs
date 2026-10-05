//! Installed packs replace the bundled ones, and only valid packs install.
//!
//! One test, run in order: the packs are process-wide, so parallel tests
//! installing different copies would race.

use sajilo_core::calendar::events::events;
use sajilo_core::calendar::weekly_holiday::{WeeklyHoliday, weekly_holiday};
use sajilo_core::config::Pack;
use sajilo_core::config::calendar::CalendarPack;
use sajilo_core::config::flags::FlagsPack;
use sajilo_core::config::jokes::JokesPack;
use sajilo_core::config::sources::SourcesPack;
use sajilo_core::focus::BreakKind;
use sajilo_core::focus::jokes::{self, JokeEdits};

fn date(text: &str) -> chrono::NaiveDate {
    text.parse().unwrap()
}

#[test]
fn packs_install_override_and_reset() {
    // Every bundled pack is valid: a released build can always fall back.
    for json in [
        JokesPack::bundled_json(),
        FlagsPack::bundled_json(),
        SourcesPack::bundled_json(),
        CalendarPack::bundled_json(),
    ] {
        assert!(serde_json::from_str::<serde_json::Value>(json).is_ok());
    }
    assert!(JokesPack::parse(JokesPack::bundled_json()).is_ok());
    assert!(FlagsPack::parse(FlagsPack::bundled_json()).is_ok());
    assert!(SourcesPack::parse(SourcesPack::bundled_json()).is_ok());
    assert!(CalendarPack::parse(CalendarPack::bundled_json()).is_ok());

    // Jokes: a remote pack changes what the deck deals.
    let bundled_eyes = jokes::lines(BreakKind::Eyes);
    let mut pack: serde_json::Value = serde_json::from_str(JokesPack::bundled_json()).unwrap();
    pack["decks"]["eyes"] = serde_json::json!([
        {"en": "Remote one.", "ne": "टाढाको एक।"},
        {"en": "Remote two.", "ne": "टाढाको दुई।"},
        {"en": "Remote three.", "ne": "टाढाको तीन।"}
    ]);
    JokesPack::install(&pack.to_string()).unwrap();
    assert_eq!(jokes::lines(BreakKind::Eyes).len(), 3);
    assert_eq!(jokes::lines(BreakKind::Eyes)[0].en, "Remote one.");

    // The user's edit of a bundled line survives a pack that lacks it.
    let mut edits = JokeEdits::new();
    edits
        .entry("eyes".to_owned())
        .or_default()
        .off
        .insert(bundled_eyes[0].en.clone());
    jokes::normalise(&mut edits);
    assert!(edits["eyes"].off.contains(&bundled_eyes[0].en));

    // An invalid pack is refused and the installed one stays.
    pack["decks"]["eyes"] = serde_json::json!([{"en": "Too few.", "ne": "थोरै।"}]);
    assert!(JokesPack::install(&pack.to_string()).is_err());
    assert_eq!(jokes::lines(BreakKind::Eyes)[0].en, "Remote one.");
    pack["decks"]["eyes"] = serde_json::json!([
        {"en": "x".repeat(200), "ne": "x"}, {"en": "b", "ne": "b"}, {"en": "c", "ne": "c"}
    ]);
    assert!(JokesPack::install(&pack.to_string()).is_err());
    assert!(JokesPack::install("{not json").is_err());

    JokesPack::reset();
    assert_eq!(jokes::lines(BreakKind::Eyes), bundled_eyes);

    // Calendar: the Sunday rule ends, and a holiday is corrected.
    assert_eq!(
        weekly_holiday(date("2026-10-04")),
        Some(WeeklyHoliday::Sunday)
    );
    CalendarPack::install(
        r#"{"sunday":{"from":"2026-04-06","until":"2026-09-30"},
            "events":[{"year":2083,"month":6,"day":2,"name":"Test Parva","holiday":true}]}"#,
    )
    .unwrap();
    assert_eq!(weekly_holiday(date("2026-10-04")), None);
    assert_eq!(
        weekly_holiday(date("2026-09-27")),
        Some(WeeklyHoliday::Sunday),
        "Sundays before the rule ended stay holidays"
    );
    let ashwin = events(2083, 6);
    assert_eq!(ashwin[&2].name.as_deref(), Some("Test Parva"));
    assert!(ashwin[&2].is_public_holiday);

    for bad in [
        r#"{"sunday":{"from":"2026-04-06","until":"2026-01-01"}}"#,
        r#"{"sunday":null,"events":[{"year":2050,"month":1,"day":1}]}"#,
        r#"{"sunday":null,"events":[{"year":2083,"month":1,"day":40}]}"#,
        r#"{"sunday":null,"events":[{"year":2083,"month":13,"day":1}]}"#,
    ] {
        assert!(CalendarPack::install(bad).is_err(), "{bad}");
    }
    CalendarPack::reset();
    assert_eq!(
        weekly_holiday(date("2026-10-04")),
        Some(WeeklyHoliday::Sunday)
    );
    assert_ne!(
        events(2083, 6)
            .get(&2)
            .and_then(|e| e.name.clone())
            .as_deref(),
        Some("Test Parva")
    );

    // Sources: rewrites apply through the module-level helper.
    SourcesPack::install(r#"{"rewrites":{"https://old.example.com/":"https://new.example.com/"}}"#)
        .unwrap();
    assert_eq!(
        sajilo_core::config::sources::rewrite("https://old.example.com/feed"),
        "https://new.example.com/feed"
    );
    SourcesPack::reset();
    assert_eq!(
        sajilo_core::config::sources::rewrite("https://old.example.com/feed"),
        "https://old.example.com/feed"
    );
}

#[test]
fn the_bundled_directory_is_valid() {
    use sajilo_core::config::directory::DirectoryPack;
    let pack = DirectoryPack::parse(DirectoryPack::bundled_json()).unwrap();
    assert!(pack.contacts.iter().any(|contact| contact.number == "100"));
    let mut bad: serde_json::Value = serde_json::from_str(DirectoryPack::bundled_json()).unwrap();
    bad["websites"][0]["url"] = "http://example.com".into();
    assert!(DirectoryPack::parse(&bad.to_string()).is_err());
}

#[test]
fn kalimati_names_match_longest_first_and_update() {
    use sajilo_core::config::kalimati::{KalimatiPack, english_name};
    assert_eq!(english_name("भेडे खुर्सानी").as_deref(), Some("Capsicum"));
    assert_eq!(english_name("खुर्सानी").as_deref(), Some("Chilli"));
    assert_eq!(english_name("कुनै नयाँ तरकारी"), None);
    // Out of order on purpose: the longer name still wins.
    let pack = KalimatiPack::parse(
        r#"{"names":[{"ne":"साग","en":"Greens"},{"ne":"नयाँ साग","en":"New greens"}]}"#,
    )
    .unwrap();
    assert_eq!(pack.names.len(), 2);
    assert!(KalimatiPack::parse(r#"{"names":[{"ne":"","en":"x"}]}"#).is_err());
}

/// A new year arrives as data: 2083's files stand in for "2084" here.
#[test]
fn a_new_year_of_festivals_installs_from_the_pack() {
    use sajilo_core::calendar::events::{LAST_EVENT_YEAR, last_event_year};
    use sajilo_core::config::calendar_years::CalendarYearsPack;

    let next = LAST_EVENT_YEAR + 1;
    assert!(events(next, 1).is_empty());
    assert_eq!(last_event_year(), LAST_EVENT_YEAR);

    let months: Vec<serde_json::Value> = (1..=12)
        .map(|month| {
            let path = format!(
                "{}/../../data/calendar-events/{LAST_EVENT_YEAR}/{month}.json",
                env!("CARGO_MANIFEST_DIR")
            );
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
        })
        .collect();
    let pack = serde_json::json!({ "years": { next.to_string(): months } });
    CalendarYearsPack::install(&pack.to_string()).unwrap();
    assert_eq!(last_event_year(), next);
    assert_eq!(events(next, 1), events(LAST_EVENT_YEAR, 1));

    // A bundled year, or eleven months, is refused.
    let bundled = serde_json::json!({ "years": { LAST_EVENT_YEAR.to_string(): months } });
    assert!(CalendarYearsPack::parse(&bundled.to_string()).is_err());
    let short = serde_json::json!({ "years": { next.to_string(): &months[..11] } });
    assert!(CalendarYearsPack::parse(&short.to_string()).is_err());

    CalendarYearsPack::reset();
    assert!(events(next, 1).is_empty());
}
