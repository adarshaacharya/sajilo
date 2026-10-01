//! Reminder planning. Ported from `FestivalNotificationPlannerTests.swift` and
//! the day-plan reminder rules.

use chrono::{Duration, NaiveDate, TimeZone, Utc};
use sajilo_core::calendar::upcoming::UpcomingEvent;
use sajilo_core::focus::ReminderStyle;
use sajilo_core::notify::{
    LATE_FIRE_WINDOW_HOURS, LIMIT, LastFired, NotificationOptions, ReminderKind, next_wake,
    plan_day_plans, plan_festivals, should_fire_late, still_deliverable,
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
        ipo_closing_day: false,
        sip_payment: false,
        ..NotificationOptions::default()
    }
}

/// Every reminder starts on, so a fresh install hears about tomorrow's festival
/// without visiting Settings first.
#[test]
fn every_reminder_is_on_by_default() {
    let events = vec![event(20, "Something", false)];
    let defaults = NotificationOptions::default();
    assert!(defaults.eve_of_festival && defaults.eve_of_public_holiday);
    assert!(defaults.ipo_closing_day);
    let planned = plan_festivals(&events, defaults, nepal(2026, 8, 1, 9));
    assert_eq!(planned.len(), 1);
}

/// A field missing from saved options takes its default, while an explicit
/// "off" the user chose is kept.
#[test]
fn stored_options_keep_an_explicit_choice() {
    let empty: NotificationOptions = serde_json::from_str("{}").unwrap();
    assert_eq!(empty, NotificationOptions::default());

    let legacy: NotificationOptions =
        serde_json::from_str(r#"{"eveOfPublicHoliday":true,"eveOfFestival":false,"hour":19}"#)
            .unwrap();
    assert!(!legacy.eve_of_festival);
    assert!(legacy.ipo_closing_day);

    let declined: NotificationOptions = serde_json::from_str(r#"{"ipoClosingDay":false}"#).unwrap();
    assert!(!declined.ipo_closing_day);
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
        ipo_closing_day: false,
        sip_payment: false,
        ..NotificationOptions::default()
    };
    let planned = plan_festivals(&events, holidays_only, now);
    assert_eq!(planned.len(), 1);
    assert!(planned[0].body.contains("Holiday"));

    let festivals_only = NotificationOptions {
        eve_of_public_holiday: false,
        eve_of_festival: true,
        hour: 19,
        ipo_closing_day: false,
        sip_payment: false,
        ..NotificationOptions::default()
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
        done: std::collections::BTreeSet::new(),
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

/// A plan ticked off before its reminder needs no reminder; a monthly one
/// moves on to next month's.
#[test]
fn a_ticked_off_plan_is_not_reminded() {
    let mut plan = timed_plan("a", 20, 9, 15);
    assert_eq!(
        plan_day_plans(&[plan.clone()], nepal(2026, 8, 1, 9)).len(),
        1
    );
    plan.set_done_on(plan.date, true);
    assert!(plan_day_plans(&[plan.clone()], nepal(2026, 8, 1, 9)).is_empty());

    plan.recurrence = Recurrence::MonthlyBikramSambat;
    let next = plan_day_plans(&[plan], nepal(2026, 8, 1, 9));
    assert_eq!(next.len(), 1, "next month's still comes");
    assert!(next[0].id.ends_with(".2083.5"), "{}", next[0].id);
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

/// A monthly plan whose day has passed this month schedules next month's, and
/// each month's reminder has its own id so one never replaces another.
#[test]
fn a_monthly_plan_rolls_forward_to_next_month() {
    let mut plan = timed_plan("report", 5, 10, 0);
    plan.recurrence = Recurrence::MonthlyBikramSambat;
    plan.date = NepaliDate::new(2083, 1, 5);

    // 2026-09-01 is BS 2083-05-16: this month's 5th has passed.
    let now = nepal(2026, 9, 1, 9);
    let planned = plan_day_plans(&[plan], now);

    assert_eq!(planned.len(), 1, "it must find a future occurrence");
    assert!(planned[0].fire_at > now);
    let fire_day = sajilo_core::calendar::bikram_sambat::nepali_date_from(
        planned[0]
            .fire_at
            .with_timezone(&nepal_time::offset())
            .date_naive(),
    )
    .unwrap();
    assert_eq!(
        fire_day,
        NepaliDate::new(2083, 6, 5),
        "next BS month, same BS day"
    );
    assert!(planned[0].id.ends_with(".2083.6"), "got {}", planned[0].id);
}

/// The body says when the plan is, from where the reminder stands, then the
/// note: the title alone reads as "now", which is wrong a day early.
#[test]
fn the_body_says_when_the_plan_is_then_the_note() {
    let body = |reminder: u32, note: &str| {
        let mut plan = timed_plan("a", 20, 9, reminder);
        plan.note = note.to_owned();
        plan_day_plans(&[plan], nepal(2026, 8, 1, 9))[0]
            .body
            .clone()
    };
    assert_eq!(body(0, ""), "Now, 09:00");
    assert_eq!(body(15, ""), "In 15 min, at 09:00");
    assert_eq!(body(60, ""), "In 1 hour, at 09:00");
    assert_eq!(body(120, ""), "In 2 hours, at 09:00");
    assert_eq!(body(1440, ""), "Tomorrow at 09:00");
    assert_eq!(
        body(15, "Bring the documents"),
        "In 15 min, at 09:00 · Bring the documents"
    );
}

/// "1 day before" fires at the same clock time on the day before, and
/// "2 hours before" two hours early on the day.
#[test]
fn the_longer_leads_fire_a_day_or_two_hours_early() {
    let local = |reminder: u32| {
        plan_day_plans(&[timed_plan("a", 20, 16, reminder)], nepal(2026, 8, 1, 9))[0]
            .fire_at
            .with_timezone(&nepal_time::offset())
    };
    let day_before = local(1440);
    let plan_day = local(0);
    assert_eq!(plan_day - day_before, Duration::days(1));
    assert_eq!(chrono::Timelike::hour(&day_before), 16);
    assert_eq!(chrono::Timelike::hour(&local(120)), 14);
}

/// Every lead the editor offers schedules something, however early.
#[test]
fn every_offered_lead_is_scheduled() {
    for lead in Reminder::CHOICES {
        let planned = plan_day_plans(&[timed_plan("a", 20, 9, lead)], nepal(2026, 8, 1, 9));
        assert_eq!(planned.len(), 1, "lead {lead} scheduled nothing");
    }
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

// ------------------------------------------------ waking after a fire time

/// The scheduler wakes a moment *after* a fire time and replans before it
/// delivers. The reminder it woke for must still be in that plan, or it is
/// never delivered at all.
#[test]
fn a_festival_reminder_is_still_planned_just_after_it_comes_due() {
    let events = vec![event(20, "Festival", false)];
    let fire_at = plan_festivals(&events, enabled(), nepal(2026, 8, 1, 9))[0].fire_at;

    let woke = fire_at + Duration::seconds(2);
    let replanned = plan_festivals(&events, enabled(), woke);
    assert_eq!(replanned.len(), 1);

    let mut fired = LastFired::default();
    assert!(should_fire_late(&replanned[0], woke, &fired));
    fired.record(&replanned[0].id, woke);
    assert!(
        !should_fire_late(&replanned[0], woke, &fired),
        "kept in the plan, but delivered only once"
    );
}

#[test]
fn a_day_plan_reminder_is_still_planned_just_after_it_comes_due() {
    let fire_at = plan_day_plans(&[timed_plan("a", 20, 9, 15)], nepal(2026, 8, 1, 9))[0].fire_at;

    let woke = fire_at + Duration::seconds(2);
    let replanned = plan_day_plans(&[timed_plan("a", 20, 9, 15)], woke);
    assert_eq!(replanned.len(), 1);
    assert!(should_fire_late(&replanned[0], woke, &LastFired::default()));
}

/// Kept only as long as it could still be delivered.
#[test]
fn a_reminder_leaves_the_plan_once_the_late_window_has_passed() {
    let events = vec![event(20, "Festival", false)];
    let fire_at = plan_festivals(&events, enabled(), nepal(2026, 8, 1, 9))[0].fire_at;
    let window_end = fire_at + Duration::hours(LATE_FIRE_WINDOW_HOURS);

    assert!(still_deliverable(fire_at, window_end));
    assert!(!still_deliverable(
        fire_at,
        window_end + Duration::minutes(1)
    ));
    assert!(plan_festivals(&events, enabled(), window_end + Duration::minutes(1)).is_empty());
}

/// A due reminder stays in the plan, but must not make the scheduler spin.
#[test]
fn the_next_wake_ignores_reminders_already_due() {
    let events = vec![event(20, "Festival", false)];
    let fire_at = plan_festivals(&events, enabled(), nepal(2026, 8, 1, 9))[0].fire_at;

    let woke = fire_at + Duration::seconds(2);
    let replanned = plan_festivals(&events, enabled(), woke);
    assert_eq!(next_wake(&replanned, woke), None);
}

/// A card is the default for every reminder, including for options saved
/// before the choice existed; a user who picked notifications keeps them.
#[test]
fn reminders_arrive_as_a_card_unless_the_user_chose_otherwise() {
    assert_eq!(NotificationOptions::default().style, ReminderStyle::Card);

    let saved_before: NotificationOptions =
        serde_json::from_str(r#"{"eveOfFestival":true,"hour":19}"#).unwrap();
    assert_eq!(saved_before.style, ReminderStyle::Card);

    let chosen: NotificationOptions = serde_json::from_str(r#"{"style":"notification"}"#).unwrap();
    assert_eq!(chosen.style, ReminderStyle::Notification);
}

/// Each reminder says what it is about, so the card can show the right icon
/// and open the right screen; a date with a holiday on it is a holiday.
#[test]
fn every_reminder_carries_its_kind() {
    let now = nepal(2026, 8, 1, 9);
    let festival = plan_festivals(&[event(20, "Festival", false)], enabled(), now);
    assert_eq!(festival[0].kind, ReminderKind::Festival);

    let holiday = plan_festivals(
        &[event(21, "Festival", false), event(21, "Holiday", true)],
        enabled(),
        now,
    );
    assert_eq!(holiday[0].kind, ReminderKind::Holiday);

    let plan = plan_day_plans(&[timed_plan("a", 20, 9, 15)], now);
    assert_eq!(plan[0].kind, ReminderKind::Plan);
}

#[test]
fn a_pause_until_tomorrow_ends_at_seven_nepal_time() {
    use sajilo_core::notify::{PauseFor, pause_end};
    // 2026-10-01 22:00 in Nepal (16:15 UTC).
    let now = Utc.with_ymd_and_hms(2026, 10, 1, 16, 15, 0).unwrap();
    let end = pause_end(PauseFor::UntilTomorrow, now);
    assert_eq!(end, Utc.with_ymd_and_hms(2026, 10, 2, 1, 15, 0).unwrap());
    let options = NotificationOptions {
        paused_until: Some(end),
        ..NotificationOptions::default()
    };
    assert!(options.is_paused(now));
    assert!(!options.is_paused(end));
}

#[test]
fn options_saved_before_the_new_switches_keep_them_on() {
    let options: NotificationOptions = serde_json::from_str(r#"{"eveOfFestival":false}"#).unwrap();
    assert!(options.day_plans && options.keeper && options.paused_until.is_none());
}
