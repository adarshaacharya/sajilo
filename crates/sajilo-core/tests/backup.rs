//! Backup format version 1 is a compatibility contract with the Swift app: a
//! backup exported there must import here. The fixture below is written in the
//! exact shape `SajiloBackup.swift` encodes — ISO-8601 dates, a UUID string id,
//! the reminder as its raw integer — so this test fails if the Rust side drifts.

use sajilo_core::backup::{BackupError, CURRENT_VERSION, Preferences, SajiloBackup};
use sajilo_core::planner::{PlanTime, Recurrence, Reminder};

/// As encoded by the Swift app.
const SWIFT_EXPORT: &str = r#"{
  "dayPlans" : [
    {
      "createdAt" : "2026-08-01T04:15:00Z",
      "date" : { "day" : 20, "month" : 4, "year" : 2083 },
      "id" : "6E7C4B2A-1F3D-4A5B-9C8E-0D1A2B3C4D5E",
      "note" : "Bring the documents",
      "recurrence" : "yearlyBikramSambat",
      "reminder" : 15,
      "time" : { "hour" : 9, "minute" : 30 },
      "title" : "Passport appointment"
    },
    {
      "createdAt" : "2026-08-02T06:00:00Z",
      "date" : { "day" : 21, "month" : 4, "year" : 2083 },
      "id" : "7F8D5C3B-2A4E-5B6C-AD9F-1E2B3C4D5E6F",
      "note" : "",
      "recurrence" : "none",
      "title" : "Pay the bill"
    }
  ],
  "exportedAt" : "2026-08-17T05:30:00Z",
  "formatVersion" : 1,
  "preferences" : {
    "appLanguage" : "ne",
    "bazarEnabled" : true,
    "customMenuBarShowsFlag" : true,
    "customMenuBarShowsYear" : false,
    "forexEnabled" : true,
    "forexFavourites" : [ "USD", "AUD", "GBP" ],
    "menuBarFormat" : "nepaliLong",
    "newsEnabled" : true,
    "notifyFestivalEve" : true,
    "notifyHolidayEve" : false,
    "numeralStyle" : "devanagari",
    "radioEnabled" : true,
    "rashifalEnabled" : true,
    "selectedRashi" : "mesh",
    "showsDockIcon" : false,
    "vegetableFavourites" : [ "आलु" ],
    "weatherEnabled" : true,
    "weatherLocation" : "kathmandu"
  }
}"#;

#[test]
fn imports_a_backup_exported_by_the_swift_app() {
    let backup = SajiloBackup::decode(SWIFT_EXPORT).expect("a Swift v1 export must import");

    assert_eq!(backup.format_version, CURRENT_VERSION);
    assert_eq!(backup.preferences.app_language, "ne");
    assert_eq!(backup.preferences.forex_favourites, ["USD", "AUD", "GBP"]);
    assert_eq!(backup.preferences.vegetable_favourites, ["आलु"]);
    assert_eq!(backup.preferences.selected_rashi.as_deref(), Some("mesh"));
    assert!(backup.preferences.notify_festival_eve);
    assert!(!backup.preferences.notify_holiday_eve);

    // The watchlist post-dates v1, so an older export omits it entirely.
    assert_eq!(backup.preferences.stock_watchlist, None);
}

/// Every day plan must survive, including the fields that are easy to lose: the
/// UUID id, the reminder's raw integer, and the recurrence.
#[test]
fn every_day_plan_survives_the_import() {
    let backup = SajiloBackup::decode(SWIFT_EXPORT).unwrap();
    assert_eq!(backup.day_plans.len(), 2);

    let appointment = &backup.day_plans[0];
    assert_eq!(appointment.id, "6E7C4B2A-1F3D-4A5B-9C8E-0D1A2B3C4D5E");
    assert_eq!(appointment.title, "Passport appointment");
    assert_eq!(appointment.date.year, 2083);
    assert_eq!(
        appointment.time,
        Some(PlanTime {
            hour: 9,
            minute: 30
        })
    );
    assert_eq!(appointment.reminder, Some(Reminder(15)));
    assert_eq!(appointment.recurrence, Recurrence::YearlyBikramSambat);
    assert_eq!(appointment.note, "Bring the documents");

    // The second plan omits `time` and `reminder` entirely, as the Swift
    // encoder does for an untimed plan.
    let bill = &backup.day_plans[1];
    assert_eq!(bill.time, None);
    assert_eq!(bill.reminder, None);
    assert_eq!(bill.recurrence, Recurrence::None);
}

/// Export must round-trip: a backup this app writes has to be one it can read.
#[test]
fn a_backup_round_trips() {
    let original = SajiloBackup::decode(SWIFT_EXPORT).unwrap();
    let encoded = original.encode().expect("encoding succeeds");
    let reimported = SajiloBackup::decode(&encoded).expect("its own export reimports");
    assert_eq!(reimported, original);
}

/// The encoded form must still be readable by the Swift app, so the field names
/// are pinned here rather than left to whatever serde does next.
#[test]
fn the_encoded_field_names_match_the_swift_contract() {
    let backup = SajiloBackup::new(Preferences::default(), Vec::new(), chrono::Utc::now());
    let json = backup.encode().unwrap();

    for key in [
        "formatVersion",
        "exportedAt",
        "preferences",
        "dayPlans",
        "menuBarFormat",
        "customMenuBarShowsFlag",
        "appLanguage",
        "numeralStyle",
        "weatherLocation",
        "forexFavourites",
        "vegetableFavourites",
        "showsDockIcon",
        "notifyHolidayEve",
        "notifyFestivalEve",
    ] {
        assert!(json.contains(&format!("\"{key}\"")), "missing {key}");
    }
    // A field added after v1 must not appear when unset, or an older Swift
    // build would reject its own format.
    assert!(!json.contains("stockWatchlist"));
}

/// A backup from a future version gets an honest message rather than a
/// field-level parse error the user cannot act on.
#[test]
fn a_newer_format_is_refused_by_version_not_by_field() {
    let future = SWIFT_EXPORT.replace("\"formatVersion\" : 1", "\"formatVersion\" : 2");
    assert_eq!(
        SajiloBackup::decode(&future),
        Err(BackupError::UnsupportedVersion(2))
    );
}

#[test]
fn a_file_that_is_not_a_backup_is_refused() {
    assert!(matches!(
        SajiloBackup::decode("not json"),
        Err(BackupError::Unreadable(_))
    ));
    assert!(matches!(
        SajiloBackup::decode(r#"{"hello":"world"}"#),
        Err(BackupError::Unreadable(_))
    ));
}

/// Live feeds and caches are deliberately excluded — they are recreated from
/// public sources, and a backup should not carry stale forex rates.
#[test]
fn the_backup_carries_no_cached_feed_data() {
    let json = SajiloBackup::new(Preferences::default(), Vec::new(), chrono::Utc::now())
        .encode()
        .unwrap();
    for leaked in ["rates", "snapshot", "fetchedAt", "prices", "items"] {
        assert!(
            !json.contains(leaked),
            "backup leaked cached feed data: {leaked}"
        );
    }
}
