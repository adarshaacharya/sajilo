//! Closing-day reminders for IPOs. Every rule is specified in Nepal time.

use chrono::{Duration, NaiveDate, TimeZone, Utc};
use sajilo_core::nepal_time;
use sajilo_core::notify::{
    IPO_CLOSING_HOUR, IpoDeadline, LATE_FIRE_WINDOW_HOURS, LastFired, NotificationOptions,
    ipo_closing_id, plan_festivals, plan_ipo_closing, should_fire_late,
};

fn nepal(year: i32, month: u32, day: u32, hour: u32) -> chrono::DateTime<Utc> {
    nepal_time::offset()
        .with_ymd_and_hms(year, month, day, hour, 0, 0)
        .unwrap()
        .with_timezone(&Utc)
}

fn date(day: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 9, day).unwrap()
}

fn deadline(name: &str, close_day: u32) -> IpoDeadline {
    IpoDeadline {
        name: name.to_owned(),
        close_date: date(close_day),
    }
}

fn ipo_only() -> NotificationOptions {
    NotificationOptions {
        eve_of_public_holiday: false,
        eve_of_festival: false,
        ipo_closing_day: true,
        ..NotificationOptions::default()
    }
}

#[test]
fn closing_day_reminders_are_on_by_default() {
    let now = nepal(2026, 9, 9, 8);
    let planned = plan_ipo_closing(
        &[deadline("BENI", 11)],
        NotificationOptions::default(),
        now,
        now,
    );
    assert!(!planned.is_empty());
}

#[test]
fn nothing_is_planned_once_the_user_switches_it_off() {
    let now = nepal(2026, 9, 9, 8);
    let off = NotificationOptions {
        ipo_closing_day: false,
        ..NotificationOptions::default()
    };
    let planned = plan_ipo_closing(&[deadline("BENI", 11)], off, now, now);
    assert!(planned.is_empty());
}

#[test]
fn switching_ipo_reminders_on_does_not_switch_festivals_on() {
    let options = ipo_only();
    assert!(options.is_any_enabled());
    assert!(plan_festivals(&[], options, nepal(2026, 9, 9, 8)).is_empty());
}

#[test]
fn fires_on_the_morning_of_the_closing_date() {
    let now = nepal(2026, 9, 9, 8);
    let planned = plan_ipo_closing(&[deadline("BENI", 11)], ipo_only(), now, now);

    assert_eq!(planned.len(), 1);
    assert_eq!(planned[0].id, ipo_closing_id(date(11)));
    assert_eq!(planned[0].fire_at, nepal(2026, 9, 11, IPO_CLOSING_HOUR));
    assert_eq!(planned[0].title, "BENI IPO closes today");
}

#[test]
fn issues_closing_the_same_day_share_one_reminder() {
    let now = nepal(2026, 9, 9, 8);
    let planned = plan_ipo_closing(
        &[
            deadline("BENI", 11),
            deadline("HHL", 11),
            deadline("SKBL", 12),
        ],
        ipo_only(),
        now,
        now,
    );

    assert_eq!(planned.len(), 2);
    assert_eq!(planned[0].title, "2 IPOs close today");
    assert!(planned[0].body.contains("BENI, HHL"));
    assert_eq!(planned[1].title, "SKBL IPO closes today");
}

#[test]
fn an_issue_that_already_closed_is_never_planned() {
    let now = nepal(2026, 9, 12, 8);
    assert!(plan_ipo_closing(&[deadline("BENI", 11)], ipo_only(), now, now).is_empty());
}

/// Planned ahead from whatever list is cached, so the scheduler wakes on time.
#[test]
fn a_reminder_still_ahead_is_planned_from_an_older_list() {
    let fetched = nepal(2026, 9, 8, 20);
    let now = nepal(2026, 9, 10, 22);
    assert_eq!(
        plan_ipo_closing(&[deadline("BENI", 11)], ipo_only(), fetched, now).len(),
        1
    );
}

/// CDSC closes oversubscribed issues early, so a due reminder needs today's list.
#[test]
fn a_due_reminder_needs_a_list_fetched_that_day() {
    let now = nepal(2026, 9, 11, IPO_CLOSING_HOUR) + Duration::minutes(1);

    let yesterday = nepal(2026, 9, 10, 23);
    assert!(plan_ipo_closing(&[deadline("BENI", 11)], ipo_only(), yesterday, now).is_empty());

    let this_morning = nepal(2026, 9, 11, 9);
    assert_eq!(
        plan_ipo_closing(&[deadline("BENI", 11)], ipo_only(), this_morning, now).len(),
        1
    );
}

/// The scheduler wakes a moment after the fire time; the reminder must still be
/// there for delivery to find, exactly once.
#[test]
fn a_just_due_reminder_is_delivered_once() {
    let now = nepal(2026, 9, 11, IPO_CLOSING_HOUR) + Duration::seconds(2);
    let planned = plan_ipo_closing(&[deadline("BENI", 11)], ipo_only(), now, now);
    let reminder = &planned[0];

    let mut fired = LastFired::default();
    assert!(should_fire_late(reminder, now, &fired));
    fired.record(&reminder.id, now);
    assert!(!should_fire_late(reminder, now, &fired));
}

#[test]
fn a_reminder_past_the_late_window_is_dropped() {
    let now = nepal(2026, 9, 11, IPO_CLOSING_HOUR) + Duration::hours(LATE_FIRE_WINDOW_HOURS + 1);
    assert!(plan_ipo_closing(&[deadline("BENI", 11)], ipo_only(), now, now).is_empty());
}
