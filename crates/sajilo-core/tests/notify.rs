//! Reminder planning. Ported from `FestivalNotificationPlannerTests.swift` and
//! the day-plan reminder rules.

use chrono::{Duration, NaiveDate, TimeZone, Utc};
use sajilo_core::calendar::upcoming::UpcomingEvent;
use sajilo_core::notify::{
    LATE_FIRE_WINDOW_HOURS, LIMIT, LastFired, NotificationOptions, next_wake, plan_day_plans,
    plan_festivals, should_fire_late,
};
use sajilo_core::planner::{DayPlan, PlanTime, Recurrence, Reminder};
use sajilo_core::{NepaliDate, nepal_time};

/// A UTC instant from a Nepal-local wall clock, which is how every rule here is
/// specified.
fn nepal(year: i32, month: u32, day: u32, hour: u32) -> chrono::DateTime<Utc> {
    nepal_time::offset()
        .with_ymd_and_hms(year, month, day, hour, 0, 0)
        .unwrap()
        .with_timezone(&Utc)
}

fn event(day: u32, name: &str, holiday: bool) -> UpcomingEvent {
    let date = NepaliDate::new(2083, 4, day);
    UpcomingEvent {
        date,
        gregorian: sajilo_core::calendar::bikram_sambat::gregorian_date_from(date).unwrap(),
        name: name.to_owned(),
        is_public_holiday: holiday,
        days_away: 0,
    }
}

fn enabled() -> NotificationOptions {
    NotificationOptions {
        eve_of_public_holiday: true,
        eve_of_festival: true,
        hour: 19,
    }
}

/// Everything is off until the user opts in, so permission is never requested
/// for a feature nobody switched on.
#[test]
fn nothing_is_planned_by_default() {
    let events = vec![event(20, "Something", false)];
    let planned = plan_festivals(
        &events,
        NotificationOptions::default(),
        nepal(2026, 8, 1, 9),
    );
    assert!(planned.is_empty());
    assert!(!NotificationOptions::default().is_any_enabled());
}

/// Each toggle is independent: turning on holidays must not deliver festivals.
#[test]
fn the_two_toggles_are_independent() {
    let events = vec![event(20, "Festival", false), event(21, "Holiday", true)];
    let now = nepal(2026, 8, 1, 9);

    let holidays_only = NotificationOptions {
        eve_of_public_holiday: true,
        eve_of_festival: false,
        hour: 19,
    };
    let planned = plan_festivals(&events, holidays_only, now);
    assert_eq!(planned.len(), 1);
    assert!(planned[0].body.contains("Holiday"));

    let festivals_only = NotificationOptions {
        eve_of_public_holiday: false,
        eve_of_festival: true,
        hour: 19,
    };
    let planned = plan_festivals(&events, festivals_only, now);
    assert_eq!(planned.len(), 1);
    assert!(planned[0].body.contains("Festival"));
}

/// Several festivals share a date often enough that three notifications firing
/// at the same instant would be the normal experience, not an edge case.
#[test]
fn festivals_on_one_date_become_one_reminder() {
    let events = vec![
        event(20, "First", false),
        event(20, "Second", false),
        event(20, "Third", true),
    ];
    let planned = plan_festivals(&events, enabled(), nepal(2026, 8, 1, 9));

    assert_eq!(planned.len(), 1);
    assert!(planned[0].body.contains("First"));
    assert!(planned[0].body.contains("Second"));
    // A holiday among them makes the whole day read as a holiday.
    assert_eq!(planned[0].title, "Public holiday tomorrow");
}

/// The reminder is the evening before, in Nepal time.
#[test]
fn the_reminder_fires_the_evening_before_in_nepal_time() {
    let planned = plan_festivals(
        &[event(20, "Festival", false)],
        enabled(),
        nepal(2026, 8, 1, 9),
    );
    let fire = planned[0].fire_at.with_timezone(&nepal_time::offset());

    let festival_day =
        sajilo_core::calendar::bikram_sambat::gregorian_date_from(NepaliDate::new(2083, 4, 20))
            .unwrap();
    assert_eq!(fire.date_naive(), festival_day.pred_opt().unwrap());
    assert_eq!(chrono::Timelike::hour(&fire), 19);
}

/// Scheduling into the past would fire the instant the app launched.
#[test]
fn a_past_event_is_never_scheduled() {
    let events = vec![event(1, "Already gone", false)];
    // Well after Shrawan 1.
    let planned = plan_festivals(&events, enabled(), nepal(2026, 12, 1, 9));
    assert!(planned.is_empty());
}

/// Stable ids mean a replan overwrites rather than stacking a second request.
#[test]
fn identifiers_are_stable_and_unique_per_date() {
    let events = vec![event(20, "A", false), event(21, "B", false)];
    let now = nepal(2026, 8, 1, 9);

    let first = plan_festivals(&events, enabled(), now);
    let second = plan_festivals(&events, enabled(), now);
    assert_eq!(
        first.iter().map(|n| n.id.clone()).collect::<Vec<_>>(),
        second.iter().map(|n| n.id.clone()).collect::<Vec<_>>()
    );

    let ids: std::collections::HashSet<&str> = first.iter().map(|n| n.id.as_str()).collect();
    assert_eq!(ids.len(), first.len());
}

/// Platform notification centres cap pending requests, so the planner must too.
#[test]
fn the_plan_is_capped() {
    let events: Vec<UpcomingEvent> = (1..=31).map(|day| event(day, "Festival", false)).collect();
    let planned = plan_festivals(&events, enabled(), nepal(2026, 7, 1, 9));
    assert!(planned.len() <= LIMIT, "got {}", planned.len());
}

// ----------------------------------------------------------- day plans

fn timed_plan(id: &str, day: u32, hour: u32, reminder: u32) -> DayPlan {
    DayPlan {
        id: id.to_owned(),
        date: NepaliDate::new(2083, 4, day),
        title: format!("Plan {id}"),
        time: Some(PlanTime { hour, minute: 0 }),
        reminder: Some(Reminder(reminder)),
        note: String::new(),
        recurrence: Recurrence::None,
        created_at: Utc::now(),
    }
}

/// A plan with no time has nothing to count a reminder back from.
#[test]
fn an_untimed_plan_is_never_scheduled() {
    let mut plan = timed_plan("a", 20, 9, 15);
    plan.time = None;
    plan.reminder = None;
    assert!(plan_day_plans(&[plan], nepal(2026, 8, 1, 9)).is_empty());
}

/// The reminder fires its lead time *before* the plan, not at it.
#[test]
fn the_reminder_leads_the_plan_by_its_offset() {
    let planned = plan_day_plans(&[timed_plan("a", 20, 9, 15)], nepal(2026, 8, 1, 9));
    assert_eq!(planned.len(), 1);

    let fire = planned[0].fire_at.with_timezone(&nepal_time::offset());
    assert_eq!(chrono::Timelike::hour(&fire), 8);
    assert_eq!(chrono::Timelike::minute(&fire), 45);
}

#[test]
fn day_plan_reminders_are_ordered_soonest_first() {
    let plans = vec![
        timed_plan("later", 25, 9, 0),
        timed_plan("sooner", 20, 9, 0),
    ];
    let planned = plan_day_plans(&plans, nepal(2026, 8, 1, 9));
    assert!(planned[0].fire_at < planned[1].fire_at);
    assert!(planned[0].id.contains("sooner"));
}

/// A yearly plan whose date has passed must schedule *next* year's occurrence
/// rather than nothing at all.
#[test]
fn a_yearly_plan_rolls_forward_to_its_next_occurrence() {
    let mut plan = timed_plan("birthday", 20, 9, 0);
    plan.recurrence = Recurrence::YearlyBikramSambat;
    plan.date = NepaliDate::new(2080, 4, 20);

    // Past Shrawan 20 in BS 2083.
    let now = nepal(2026, 9, 1, 9);
    let planned = plan_day_plans(&[plan], now);

    assert_eq!(planned.len(), 1, "it must find a future occurrence");
    assert!(planned[0].fire_at > now);
    // The id carries the occurrence year, or next year's reminder would replace
    // this year's.
    assert!(planned[0].id.ends_with(".2084"), "got {}", planned[0].id);
}

/// A plan with no note still needs a body — a blank notification says nothing.
#[test]
fn a_plan_without_a_note_gets_a_default_body() {
    let planned = plan_day_plans(&[timed_plan("a", 20, 9, 0)], nepal(2026, 8, 1, 9));
    assert_eq!(planned[0].body, "Sajilo day plan");

    let mut with_note = timed_plan("b", 20, 9, 0);
    with_note.note = "Bring the documents".to_owned();
    let planned = plan_day_plans(&[with_note], nepal(2026, 8, 1, 9));
    assert_eq!(planned[0].body, "Bring the documents");
}

// -------------------------------------------------------- late firing

/// Restarting five times on a reminder day must produce exactly one
/// notification.
#[test]
fn a_recorded_notification_never_fires_again() {
    let planned = plan_day_plans(&[timed_plan("a", 20, 9, 0)], nepal(2026, 8, 1, 9));
    let notification = &planned[0];
    let just_after = notification.fire_at + Duration::minutes(5);

    let mut fired = LastFired::default();
    assert!(should_fire_late(notification, just_after, &fired));

    fired.record(&notification.id, just_after);
    for _ in 0..5 {
        assert!(
            !should_fire_late(notification, just_after, &fired),
            "a restart must not re-fire it"
        );
    }
}

/// A laptop shut overnight should still surface this morning's plan; a reminder
/// from last week should not arrive as a surprise.
#[test]
fn a_late_reminder_fires_inside_the_window_and_is_skipped_beyond_it() {
    let planned = plan_day_plans(&[timed_plan("a", 20, 9, 0)], nepal(2026, 8, 1, 9));
    let notification = &planned[0];
    let fired = LastFired::default();

    let inside = notification.fire_at + Duration::hours(LATE_FIRE_WINDOW_HOURS - 1);
    assert!(should_fire_late(notification, inside, &fired));

    let beyond = notification.fire_at + Duration::hours(LATE_FIRE_WINDOW_HOURS + 1);
    assert!(!should_fire_late(notification, beyond, &fired));

    // Not yet due is not "late".
    let before = notification.fire_at - Duration::minutes(1);
    assert!(!should_fire_late(notification, before, &fired));
}

/// The record must not grow for the life of the install.
#[test]
fn the_fired_record_is_pruned() {
    let now = Utc::now();
    let mut fired = LastFired::default();
    fired.record("recent", now - Duration::days(2));
    fired.record("ancient", now - Duration::days(90));

    fired.prune(now);
    assert!(fired.was_fired("recent"));
    assert!(!fired.was_fired("ancient"));
}

/// The scheduler sleeps until the next fire rather than polling.
#[test]
fn the_next_wake_is_the_soonest_future_fire() {
    let now = nepal(2026, 8, 1, 9);
    let planned = plan_day_plans(
        &[
            timed_plan("later", 25, 9, 0),
            timed_plan("sooner", 20, 9, 0),
        ],
        now,
    );

    let wake = next_wake(&planned, now).expect("something is pending");
    assert_eq!(wake, planned[0].fire_at);

    // Nothing pending means nothing to wake for.
    assert_eq!(next_wake(&[], now), None);
    let all_past = planned[1].fire_at + Duration::days(1);
    assert_eq!(next_wake(&planned, all_past), None);
}

/// The planners share the `PlannedNotification` shape, and their id prefixes
/// must not collide — otherwise one would silently replace the other.
#[test]
fn the_two_planners_cannot_collide() {
    let now = nepal(2026, 8, 1, 9);
    let festivals = plan_festivals(&[event(20, "Festival", false)], enabled(), now);
    let plans = plan_day_plans(&[timed_plan("a", 20, 9, 0)], now);

    assert!(festivals[0].id.starts_with("sajilo.festival."));
    assert!(plans[0].id.starts_with("sajilo.plan."));
    assert_ne!(festivals[0].id, plans[0].id);
}

/// The event's own date must survive into the reminder, so a bad conversion
/// cannot silently shift a notification by a day.
#[test]
fn the_reminder_date_matches_the_event() {
    let planned = plan_festivals(
        &[event(20, "Festival", false)],
        enabled(),
        nepal(2026, 8, 1, 9),
    );
    let expected = NaiveDate::from_ymd_opt(2026, 8, 4).unwrap();
    let fire = planned[0]
        .fire_at
        .with_timezone(&nepal_time::offset())
        .date_naive();
    // BS 2083-04-20 is 5 August 2026, so the eve is the 4th.
    assert_eq!(fire, expected);
}
