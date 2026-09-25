//! Break reminders and screen time, walked through simulated workdays.

use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Utc, Weekday};
use sajilo_core::focus::{
    BreakKind, BreakOutcome, FocusSettings, FocusState, FocusStatus, Language, PauseChoice,
    ReminderStyle, SNOOZE_MINUTES, Tick, announcement, finish_break, jokes, litres, log_water,
    pause, preview_break, snapshot, tick,
};
use std::collections::HashSet;

const STEP: i64 = 15;

/// A Monday at 10:00. The tests treat the computer's clock as UTC.
fn monday_at(hour: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 9, 21, hour, 0, 0).unwrap()
}

fn at(now: DateTime<Utc>, idle: u32) -> Tick {
    Tick {
        now,
        local: now.naive_utc(),
        idle_seconds: Some(idle),
        display_held: false,
    }
}

/// A tick while some app holds the display awake: a video, a call.
fn watching(now: DateTime<Utc>, idle: u32) -> Tick {
    Tick {
        display_held: true,
        ..at(now, idle)
    }
}

fn eyes_only() -> FocusSettings {
    let mut settings = FocusSettings::default();
    settings.eyes.enabled = true;
    settings
}

/// Ticks every 15 s for `minutes`, with the idle time `idle` gives for each
/// moment, and returns every break announced and when.
fn run(
    state: &mut FocusState,
    settings: &FocusSettings,
    start: DateTime<Utc>,
    minutes: i64,
    idle: impl Fn(DateTime<Utc>) -> u32,
) -> Vec<(DateTime<Utc>, BreakKind)> {
    let mut due = Vec::new();
    let mut now = start;
    while now <= start + Duration::minutes(minutes) {
        for kind in tick(state, settings, at(now, idle(now))) {
            due.push((now, kind));
        }
        now += Duration::seconds(STEP);
    }
    due
}

fn busy(_: DateTime<Utc>) -> u32 {
    5
}

#[test]
fn nothing_is_ever_due_until_a_reminder_is_switched_on() {
    let settings = FocusSettings::default();
    let mut state = FocusState::default();
    assert!(run(&mut state, &settings, monday_at(10), 180, busy).is_empty());

    let view = snapshot(
        &mut state,
        &settings,
        monday_at(13),
        monday_at(13).naive_utc(),
    );
    assert_eq!(view.status, FocusStatus::Off);
    // Screen time is still measured with every reminder off.
    assert!(view.today.screen_seconds >= 179 * 60);
}

#[test]
fn the_eye_reminder_comes_after_twenty_minutes_of_use() {
    let mut state = FocusState::default();
    let due = run(&mut state, &eyes_only(), monday_at(10), 45, busy);

    let times: Vec<_> = due.iter().map(|(time, _)| *time - monday_at(10)).collect();
    assert_eq!(times, [Duration::minutes(20), Duration::minutes(40)]);
    assert!(due.iter().all(|(_, kind)| *kind == BreakKind::Eyes));
    assert_eq!(state.today.as_ref().unwrap().eyes.reminded, 2);
}

/// Five minutes away is a break in itself: the next reminder counts 20 minutes
/// of use from the return, not from the morning.
#[test]
fn stepping_away_starts_the_timers_over() {
    let mut state = FocusState::default();
    let start = monday_at(10);
    let lunch = |now: DateTime<Utc>| {
        let minute = (now - start).num_minutes();
        if (15..21).contains(&minute) {
            // Idle grows from the moment they left.
            u32::try_from((now - (start + Duration::minutes(15))).num_seconds()).unwrap()
        } else {
            5
        }
    };
    let due = run(&mut state, &eyes_only(), start, 45, lunch);

    let first = due.first().expect("a reminder after coming back").0 - start;
    assert!(first >= Duration::minutes(40), "got {first}");
}

#[test]
fn a_quiet_computer_after_a_reminder_counts_the_break_as_taken() {
    let mut state = FocusState::default();
    let start = monday_at(10);
    let settings = eyes_only();
    run(&mut state, &settings, start, 20, busy);
    assert_eq!(state.today.as_ref().unwrap().eyes.reminded, 1);

    // They look away: no input for 30 s.
    tick(
        &mut state,
        &settings,
        at(start + Duration::seconds(20 * 60 + 30), 30),
    );
    assert_eq!(state.today.as_ref().unwrap().eyes.taken, 1);
}

#[test]
fn a_reminder_ignored_past_its_window_is_not_taken() {
    let mut state = FocusState::default();
    let start = monday_at(10);
    run(&mut state, &eyes_only(), start, 30, busy);
    let today = state.today.as_ref().unwrap();
    assert_eq!((today.eyes.reminded, today.eyes.taken), (1, 0));
}

#[test]
fn nothing_is_due_outside_work_hours_but_screen_time_counts() {
    let mut settings = eyes_only();
    settings.end_of_day = false;
    let mut state = FocusState::default();
    let evening = monday_at(19);
    assert!(run(&mut state, &settings, evening, 60, busy).is_empty());
    assert!(state.today.as_ref().unwrap().screen_seconds >= 59 * 60);

    let view = snapshot(&mut state, &settings, evening, evening.naive_utc());
    assert_eq!(view.status, FocusStatus::OutsideHours);
    assert_eq!(view.breaks[0].minutes_left, None);
}

#[test]
fn saturday_is_a_day_off_by_default() {
    let saturday = Utc.with_ymd_and_hms(2026, 9, 26, 10, 0, 0).unwrap();
    assert_eq!(saturday.weekday(), Weekday::Sat);
    let mut state = FocusState::default();
    assert!(run(&mut state, &eyes_only(), saturday, 60, busy).is_empty());
}

#[test]
fn public_holidays_are_quiet_unless_asked_otherwise() {
    // The first public holiday in the bundled calendar that falls on a
    // weekday someone would normally work.
    let holiday = (0..365)
        .map(|offset| NaiveDate::from_ymd_opt(2026, 1, 1).unwrap() + Duration::days(offset))
        .find(|date| {
            date.weekday() != Weekday::Sat && {
                let bs = sajilo_core::calendar::bikram_sambat::nepali_date_from(*date).unwrap();
                sajilo_core::calendar::events::events(bs.year, bs.month)
                    .get(&bs.day)
                    .is_some_and(|event| event.is_public_holiday)
            }
        })
        .expect("a weekday public holiday in 2026");
    let start = Utc.from_utc_datetime(&holiday.and_hms_opt(10, 0, 0).unwrap());

    let mut state = FocusState::default();
    assert!(run(&mut state, &eyes_only(), start, 30, busy).is_empty());

    let mut working = eyes_only();
    working.skip_public_holidays = false;
    let mut state = FocusState::default();
    assert_eq!(run(&mut state, &working, start, 30, busy).len(), 1);
}

/// A closed lid is neither screen time nor a reason to nag the moment it
/// opens: the gap reads as time away.
#[test]
fn a_sleep_gap_is_time_away() {
    let mut state = FocusState::default();
    let settings = eyes_only();
    run(&mut state, &settings, monday_at(10), 15, busy);
    let before = state.today.as_ref().unwrap().screen_seconds;

    let after_sleep = monday_at(11);
    assert!(tick(&mut state, &settings, at(after_sleep, 2)).is_empty());
    assert_eq!(state.today.as_ref().unwrap().screen_seconds, before);
    let due = run(&mut state, &settings, after_sleep, 25, busy);
    assert_eq!(due[0].0 - after_sleep, Duration::minutes(20));
}

#[test]
fn only_the_minutes_before_going_quiet_count() {
    let mut state = FocusState::default();
    let settings = FocusSettings::default();
    tick(&mut state, &settings, at(monday_at(10), 0));
    // 60 s later, but the last input was 90 s ago: only the first 30 s of
    // that minute were at the computer.
    tick(
        &mut state,
        &settings,
        at(monday_at(10) + Duration::seconds(60), 90),
    );
    assert_eq!(state.today.as_ref().unwrap().screen_seconds, 30);
}

#[test]
fn water_reminders_stop_at_the_daily_goal() {
    let mut settings = FocusSettings::default();
    settings.water.enabled = true;
    settings.water_goal_ml = 1500;
    let mut state = FocusState::default();
    let start = monday_at(9);
    log_water(&mut state, start.naive_utc(), 6);

    assert!(run(&mut state, &settings, start, 180, busy).is_empty());
    let view = snapshot(&mut state, &settings, start, start.naive_utc());
    assert_eq!(
        view.breaks[2].minutes_left, None,
        "goal met: nothing counts down"
    );
}

#[test]
fn logging_water_restarts_its_timer() {
    let mut settings = FocusSettings::default();
    settings.water.enabled = true;
    let mut state = FocusState::default();
    let start = monday_at(10);
    run(&mut state, &settings, start, 50, busy);
    log_water(&mut state, (start + Duration::minutes(50)).naive_utc(), 1);

    let due = run(
        &mut state,
        &settings,
        start + Duration::minutes(50),
        40,
        busy,
    );
    assert!(due.is_empty(), "the full hour starts again after a glass");
}

#[test]
fn a_new_day_files_yesterday_into_history() {
    let mut state = FocusState::default();
    let settings = eyes_only();
    run(&mut state, &settings, monday_at(10), 10, busy);
    let tuesday = monday_at(10) + Duration::days(1);
    tick(&mut state, &settings, at(tuesday, 5));

    assert_eq!(state.today.as_ref().unwrap().date, tuesday.date_naive());
    assert_eq!(state.history.len(), 1);
    assert_eq!(state.history[0].date, monday_at(10).date_naive());
    assert!(state.history[0].screen_seconds >= 9 * 60);
}

/// The week view always has seven days ending today, gaps filled with empty
/// days, so the chart never stretches one bar across the card.
#[test]
fn the_week_is_seven_days_ending_today() {
    let mut state = FocusState::default();
    let settings = FocusSettings::default();
    run(&mut state, &settings, monday_at(10), 10, busy);
    let thursday = monday_at(10) + Duration::days(3);
    tick(&mut state, &settings, at(thursday, 5));

    let view = snapshot(&mut state, &settings, thursday, thursday.naive_utc());
    assert_eq!(view.week.len(), 7);
    assert_eq!(view.week[6].date, thursday.date_naive(), "today last");
    assert_eq!(view.week[0].date, thursday.date_naive() - Duration::days(6));
    let monday = view
        .week
        .iter()
        .find(|day| day.date == monday_at(10).date_naive())
        .unwrap();
    assert!(
        monday.screen_seconds >= 9 * 60,
        "recorded days keep their time"
    );
    assert_eq!(
        view.week[5].screen_seconds, 0,
        "an unrecorded Wednesday is empty"
    );
}

#[test]
fn pausing_for_the_rest_of_the_day_ends_at_midnight() {
    let mut state = FocusState::default();
    let settings = eyes_only();
    let now = monday_at(14);
    pause(&mut state, PauseChoice::RestOfDay, now, now.naive_utc());
    assert_eq!(
        state.paused_until,
        Some(Utc.with_ymd_and_hms(2026, 9, 22, 0, 0, 0).unwrap())
    );
    assert!(run(&mut state, &settings, now, 60, busy).is_empty());
    assert_eq!(
        snapshot(&mut state, &settings, now, now.naive_utc()).status,
        FocusStatus::Paused
    );

    pause(&mut state, PauseChoice::Resume, now, now.naive_utc());
    assert_eq!(state.paused_until, None);
}

#[test]
fn the_snapshot_counts_down_in_minutes_of_use() {
    let mut state = FocusState::default();
    let settings = eyes_only();
    let start = monday_at(10);
    run(&mut state, &settings, start, 5, busy);
    let now = start + Duration::minutes(5);
    let view = snapshot(&mut state, &settings, now, now.naive_utc());
    assert_eq!(view.status, FocusStatus::Active);
    assert_eq!(view.breaks[0].minutes_left, Some(15));
    assert_eq!(view.breaks[1].minutes_left, None, "movement is off");
}

#[test]
fn stored_settings_fill_in_and_stay_within_the_editor() {
    let settings: FocusSettings = serde_json::from_str("{}").unwrap();
    assert_eq!(settings, FocusSettings::default());
    assert!(!settings.any_enabled());

    let odd: FocusSettings =
        serde_json::from_str(r#"{"eyes":{"enabled":true,"everyMinutes":7},"waterGoalMl":1234}"#)
            .unwrap();
    let odd = odd.normalised();
    assert_eq!(odd.eyes.every_minutes, 7, "any interval in range is kept");

    let silly: FocusSettings =
        serde_json::from_str(r#"{"eyes":{"enabled":true,"everyMinutes":2}}"#).unwrap();
    assert_eq!(
        silly.normalised().eyes.every_minutes,
        5,
        "clamped to the range"
    );
    assert_eq!(odd.water_goal_ml, 1250, "rounded to 50 ml");

    let greedy: FocusSettings = serde_json::from_str(r#"{"waterGoalMl":40000}"#).unwrap();
    assert_eq!(
        greedy.normalised().water_goal_ml,
        8000,
        "within the sane range"
    );
}

#[test]
fn an_overnight_shift_wraps_past_midnight() {
    let mut settings = eyes_only();
    settings.work_start = sajilo_core::planner::PlanTime {
        hour: 22,
        minute: 0,
    };
    settings.work_end = sajilo_core::planner::PlanTime { hour: 6, minute: 0 };
    let mut state = FocusState::default();
    assert_eq!(run(&mut state, &settings, monday_at(23), 25, busy).len(), 1);
    let mut state = FocusState::default();
    assert!(run(&mut state, &settings, monday_at(12), 25, busy).is_empty());
}

/// Each tap is a quarter litre, it never goes below nothing, and the
/// notification reads in litres without trailing zeros.
#[test]
fn water_is_counted_in_litres() {
    let mut state = FocusState::default();
    let now = monday_at(10).naive_utc();
    log_water(&mut state, now, 5);
    assert_eq!(state.today.as_ref().unwrap().water_ml, 1250);
    log_water(&mut state, now, -10);
    assert_eq!(state.today.as_ref().unwrap().water_ml, 0);

    assert_eq!(litres(1250), "1.25");
    assert_eq!(litres(2500), "2.5");
    assert_eq!(litres(2000), "2");
    assert_eq!(litres(0), "0");
}

// ------------------------------------------------------------ break card

#[test]
fn a_due_break_opens_a_card_with_its_countdown() {
    let mut state = FocusState::default();
    run(&mut state, &eyes_only(), monday_at(10), 20, busy);
    let card = state.active_break.clone().expect("a card is showing");
    assert_eq!(card.kind, BreakKind::Eyes);
    assert_eq!(card.seconds, 20);

    let mut quiet = eyes_only();
    quiet.style = ReminderStyle::Notification;
    let mut state = FocusState::default();
    run(&mut state, &quiet, monday_at(10), 20, busy);
    assert_eq!(state.active_break, None, "notification style opens no card");
}

/// Letting the countdown run out takes the break, once, even if the quiet
/// computer had already counted it.
#[test]
fn finishing_the_countdown_counts_the_break_once() {
    let settings = eyes_only();
    let mut state = FocusState::default();
    run(&mut state, &settings, monday_at(10), 20, busy);
    let local = (monday_at(10) + Duration::minutes(21)).naive_utc();
    finish_break(&mut state, &settings, BreakOutcome::Done, local);
    finish_break(&mut state, &settings, BreakOutcome::Done, local);

    let today = state.today.as_ref().unwrap();
    assert_eq!((today.eyes.reminded, today.eyes.taken), (1, 1));
    assert_eq!(state.active_break, None);
}

#[test]
fn skipping_leaves_the_break_untaken() {
    let settings = eyes_only();
    let mut state = FocusState::default();
    run(&mut state, &settings, monday_at(10), 20, busy);
    finish_break(
        &mut state,
        &settings,
        BreakOutcome::Skip,
        monday_at(11).naive_utc(),
    );
    let today = state.today.as_ref().unwrap();
    assert_eq!((today.eyes.reminded, today.eyes.taken), (1, 0));
}

/// "In 5 min" brings the same reminder back after five more minutes of use,
/// and it is not counted as a second reminder.
#[test]
fn snoozing_asks_again_after_five_minutes_of_use() {
    let settings = eyes_only();
    let mut state = FocusState::default();
    let start = monday_at(10);
    run(&mut state, &settings, start, 20, busy);
    let snoozed_at = start + Duration::seconds(20 * 60 + 15);
    finish_break(
        &mut state,
        &settings,
        BreakOutcome::Snooze,
        snoozed_at.naive_utc(),
    );

    let due = run(&mut state, &settings, snoozed_at, 10, busy);
    let back = due.first().expect("it comes back").0 - snoozed_at;
    assert!(
        back <= Duration::minutes(i64::from(SNOOZE_MINUTES)),
        "got {back}"
    );
    assert_eq!(state.today.as_ref().unwrap().eyes.reminded, 1);
}

#[test]
fn drinking_from_the_card_logs_a_step_of_water() {
    let mut settings = FocusSettings::default();
    settings.water.enabled = true;
    let mut state = FocusState::default();
    run(&mut state, &settings, monday_at(10), 60, busy);
    assert_eq!(
        state.active_break.as_ref().map(|card| card.kind),
        Some(BreakKind::Water)
    );
    finish_break(
        &mut state,
        &settings,
        BreakOutcome::Drank,
        monday_at(11).naive_utc(),
    );
    assert_eq!(state.today.as_ref().unwrap().water_ml, 250);
}

/// Standing up rests the eyes as well, so one card, not two.
#[test]
fn a_movement_break_stands_in_for_an_eye_break_due_at_once() {
    let mut settings = eyes_only();
    settings.move_break.enabled = true;
    let mut state = FocusState::default();
    let due = run(&mut state, &settings, monday_at(10), 60, busy);
    let at_the_hour: Vec<_> = due
        .iter()
        .filter(|(time, _)| *time - monday_at(10) == Duration::minutes(60))
        .map(|(_, kind)| *kind)
        .collect();
    assert_eq!(at_the_hour, [BreakKind::Move]);
    assert_eq!(
        state.today.as_ref().unwrap().eyes.reminded,
        2,
        "only the 20 and 40"
    );
}

#[test]
fn an_ignored_card_goes_away_on_its_own() {
    let settings = eyes_only();
    let mut state = FocusState::default();
    run(&mut state, &settings, monday_at(10), 20, busy);
    assert!(state.active_break.is_some());
    run(
        &mut state,
        &settings,
        monday_at(10) + Duration::minutes(20),
        3,
        busy,
    );
    assert_eq!(state.active_break, None);
}

#[test]
fn pausing_puts_the_card_away() {
    let settings = eyes_only();
    let mut state = FocusState::default();
    run(&mut state, &settings, monday_at(10), 20, busy);
    let now = monday_at(10) + Duration::minutes(21);
    pause(&mut state, PauseChoice::Hour, now, now.naive_utc());
    assert_eq!(state.active_break, None);
}

/// "Show me an example" opens a real card that counts for nothing.
#[test]
fn an_example_card_changes_no_count_or_timer() {
    let settings = eyes_only();
    let mut state = FocusState::default();
    run(&mut state, &settings, monday_at(10), 10, busy);
    let before = state.clone();
    preview_break(&mut state, &settings, BreakKind::Eyes, monday_at(11));
    assert!(state.active_break.as_ref().is_some_and(|card| card.preview));
    finish_break(
        &mut state,
        &settings,
        BreakOutcome::Done,
        monday_at(11).naive_utc(),
    );
    assert_eq!(state, before);
}

// ---------------------------------------------------------- custom break

fn custom(label: &str, every: u32) -> FocusSettings {
    let mut settings = FocusSettings::default();
    settings.custom.enabled = true;
    label.clone_into(&mut settings.custom.label);
    settings.custom.every_minutes = every;
    settings.end_of_day = false;
    settings
}

#[test]
fn a_custom_break_comes_on_its_own_interval() {
    let settings = custom("Stretch your wrists", 30);
    let mut state = FocusState::default();
    let due = run(&mut state, &settings, monday_at(10), 65, busy);
    let times: Vec<_> = due
        .iter()
        .map(|(time, kind)| (*time - monday_at(10), *kind))
        .collect();
    assert_eq!(
        times,
        [
            (Duration::minutes(30), BreakKind::Custom),
            (Duration::minutes(60), BreakKind::Custom)
        ]
    );

    let mut state = FocusState::default();
    run(&mut state, &settings, monday_at(10), 30, busy);
    let card = state
        .active_break
        .clone()
        .expect("a card when it comes due");
    assert_eq!((card.kind, card.seconds), (BreakKind::Custom, 0));
}

/// A reminder with no words is not a reminder.
#[test]
fn a_custom_break_without_words_never_comes() {
    let settings = custom("   ", 30);
    let mut state = FocusState::default();
    assert!(run(&mut state, &settings, monday_at(10), 90, busy).is_empty());
    assert!(!settings.any_enabled());
}

#[test]
fn a_custom_label_is_trimmed_and_kept_short() {
    let long = format!("  {}  ", "x".repeat(200));
    let settings = custom(&long, 7).normalised();
    assert_eq!(settings.custom.label.len(), 60);
    assert_eq!(
        settings.custom.every_minutes, 7,
        "a typed interval in range is kept"
    );
}

// ------------------------------------------------------ end of work day

fn working() -> FocusSettings {
    let mut settings = eyes_only();
    settings.end_of_day = true;
    settings
}

#[test]
fn the_end_of_work_nudge_comes_once_when_work_ends() {
    let settings = working();
    let mut state = FocusState::default();
    // Work ends at 18:00; still at the computer from 17:50 to 19:00.
    let due = run(
        &mut state,
        &settings,
        monday_at(17) + Duration::minutes(50),
        70,
        busy,
    );
    let ends: Vec<_> = due
        .iter()
        .filter(|(_, kind)| *kind == BreakKind::EndOfDay)
        .map(|(time, _)| *time)
        .collect();
    assert_eq!(ends, [monday_at(18)]);
}

#[test]
fn nobody_at_the_computer_gets_no_end_of_work_nudge() {
    let settings = working();
    let mut state = FocusState::default();
    let gone = |_: DateTime<Utc>| 3_600;
    let due = run(&mut state, &settings, monday_at(18), 60, gone);
    assert!(due.iter().all(|(_, kind)| *kind != BreakKind::EndOfDay));
}

#[test]
fn no_end_of_work_nudge_on_a_day_off_or_with_reminders_off() {
    let saturday = Utc.with_ymd_and_hms(2026, 9, 26, 18, 0, 0).unwrap();
    let mut state = FocusState::default();
    assert!(run(&mut state, &working(), saturday, 30, busy).is_empty());

    // Every reminder off, so there is no work day to end.
    let off = FocusSettings {
        end_of_day: true,
        ..FocusSettings::default()
    };
    let mut state = FocusState::default();
    assert!(run(&mut state, &off, monday_at(18), 30, busy).is_empty());
}

#[test]
fn putting_off_the_end_of_work_nudge_brings_it_back() {
    let settings = working();
    let mut state = FocusState::default();
    run(&mut state, &settings, monday_at(18), 1, busy);
    assert_eq!(
        state.active_break.as_ref().map(|card| card.kind),
        Some(BreakKind::EndOfDay)
    );
    finish_break(
        &mut state,
        &settings,
        BreakOutcome::Snooze,
        monday_at(18).naive_utc(),
    );

    let due = run(
        &mut state,
        &settings,
        monday_at(18) + Duration::minutes(1),
        10,
        busy,
    );
    let back = due
        .iter()
        .find(|(_, kind)| *kind == BreakKind::EndOfDay)
        .expect("it comes back")
        .0;
    assert_eq!(
        back,
        monday_at(18) + Duration::minutes(i64::from(SNOOZE_MINUTES))
    );
}

/// State saved before the custom break existed had three timers, not four.
#[test]
fn state_saved_with_fewer_timers_still_loads() {
    let raw = r#"{"sinceBreak":[100,200,300],"awaiting":[null,null,null]}"#;
    let state: FocusState = serde_json::from_str(raw).expect("still loads");
    assert_eq!(state.since_break, [100, 200, 300, 0]);
}

/// Turning everything off keeps what was set up, so turning it back on
/// needs no setting up again.
#[test]
fn turning_breaks_off_keeps_the_setup() {
    let mut settings = custom("Stretch your wrists", 45).with_recommended_breaks();
    settings.eyes.every_minutes = 25;
    let off = settings.clone().with_breaks_off();
    assert!(!off.any_enabled());
    assert_eq!(off.eyes.every_minutes, 25);
    assert_eq!(off.custom.label, "Stretch your wrists");
    assert!(off.with_recommended_breaks().any_enabled());
}

/// Every kind takes five minutes to eight hours: longer could never come due
/// in a work day.
#[test]
fn every_interval_runs_from_five_minutes_to_eight_hours() {
    for kind in BreakKind::ALL {
        assert_eq!(kind.interval_range(), (5, 480), "{kind:?}");
    }
    let mut settings = FocusSettings::default();
    settings.water.every_minutes = 1_440;
    assert_eq!(settings.normalised().water.every_minutes, 480);
}

// ------------------------------------------------------ meals and bedtime

fn with_lunch() -> FocusSettings {
    let mut settings = FocusSettings::default();
    settings.routine.lunch.enabled = true;
    settings.routine.lunch.at = sajilo_core::planner::PlanTime {
        hour: 13,
        minute: 0,
    };
    settings
}

#[test]
fn lunch_comes_once_at_its_time() {
    let mut state = FocusState::default();
    let due = run(&mut state, &with_lunch(), monday_at(12), 120, busy);
    assert_eq!(due, [(monday_at(13), BreakKind::Lunch)]);
}

/// Bedtime is after work by design: work hours do not silence it.
#[test]
fn bedtime_comes_outside_work_hours() {
    let mut settings = FocusSettings::default();
    settings.routine.bedtime.enabled = true;
    let mut state = FocusState::default();
    let due = run(
        &mut state,
        &settings,
        monday_at(22) + Duration::minutes(50),
        20,
        busy,
    );
    assert_eq!(due, [(monday_at(23), BreakKind::Bedtime)]);
}

/// Sitting down an hour and a half after lunch time is too late to nag.
#[test]
fn a_meal_missed_by_over_an_hour_is_let_go() {
    let mut state = FocusState::default();
    let away = |now: DateTime<Utc>| {
        if now < monday_at(14) + Duration::minutes(30) {
            9_999
        } else {
            5
        }
    };
    let due = run(&mut state, &with_lunch(), monday_at(12), 180, away);
    assert!(due.is_empty());
}

#[test]
fn a_put_off_meal_comes_back_in_five_minutes() {
    let settings = with_lunch();
    let mut state = FocusState::default();
    run(&mut state, &settings, monday_at(13), 0, busy);
    assert_eq!(
        state.active_break.as_ref().map(|card| card.kind),
        Some(BreakKind::Lunch)
    );
    finish_break(
        &mut state,
        &settings,
        BreakOutcome::Snooze,
        monday_at(13).naive_utc(),
    );
    let due = run(
        &mut state,
        &settings,
        monday_at(13) + Duration::minutes(1),
        10,
        busy,
    );
    assert_eq!(
        due,
        [(monday_at(13) + Duration::minutes(5), BreakKind::Lunch)]
    );
}

/// Another card on screen: lunch waits its turn rather than being lost.
#[test]
fn a_meal_waits_for_the_card_on_screen() {
    let mut settings = with_lunch();
    settings.eyes.enabled = true;
    let mut state = FocusState::default();
    // The eye card comes at 12:59 and is still up at 13:00.
    let start = monday_at(12) + Duration::minutes(39);
    run(&mut state, &settings, start, 20, busy);
    assert_eq!(
        state.active_break.as_ref().map(|card| card.kind),
        Some(BreakKind::Eyes)
    );
    let due = run(&mut state, &settings, monday_at(13), 5, busy);
    let lunch = due.iter().find(|(_, kind)| *kind == BreakKind::Lunch);
    assert!(
        lunch.is_some_and(|(time, _)| *time > monday_at(13)),
        "lunch comes once the eye card has gone, got {due:?}"
    );
}

#[test]
fn turning_everything_off_includes_meals() {
    let settings = with_lunch();
    assert!(settings.any_enabled(), "meals alone count as on");
    assert!(!settings.with_breaks_off().any_enabled());
}

// ------------------------------------------------------------ break length

/// The card counts down however long the user set the break to last, and a
/// break's length stays within what makes sense for it.
#[test]
fn a_break_lasts_as_long_as_the_user_set() {
    let mut settings = eyes_only();
    settings.eyes_seconds = 45;
    let mut state = FocusState::default();
    run(&mut state, &settings, monday_at(10), 20, busy);
    assert_eq!(state.active_break.expect("a card").seconds, 45);

    settings.eyes_seconds = 1;
    settings.move_seconds = 60 * 60;
    let kept = settings.normalised();
    assert_eq!(kept.eyes_seconds, BreakKind::Eyes.length_range().0);
    assert_eq!(kept.move_seconds, BreakKind::Move.length_range().1);
}

/// Settings saved before lengths existed keep the old ones: 20 seconds for
/// the eyes, two minutes to stand up.
#[test]
fn settings_saved_before_break_length_keep_the_defaults() {
    let saved: FocusSettings =
        serde_json::from_str(r#"{"eyes":{"enabled":true,"everyMinutes":20}}"#).unwrap();
    assert_eq!((saved.eyes_seconds, saved.move_seconds), (20, 120));
}

/// A longer walk needs a longer quiet computer before it counts as taken.
#[test]
fn a_break_counts_as_taken_after_its_own_length() {
    let mut settings = FocusSettings::default();
    settings.move_break.enabled = true;
    settings.move_seconds = 5 * 60;
    settings.style = ReminderStyle::Notification;
    let mut state = FocusState::default();
    run(&mut state, &settings, monday_at(10), 60, busy);
    let away_since = monday_at(11);
    // Two minutes away was enough before; now it is not.
    run(&mut state, &settings, away_since, 2, |now| {
        u32::try_from((now - away_since).num_seconds()).unwrap()
    });
    assert_eq!(state.today.as_ref().unwrap().move_break.taken, 0);
}

// ------------------------------------------------------------ the week

/// A stretch is time at the computer without stepping away for two minutes;
/// the day keeps its longest, and a short pause does not end one.
#[test]
fn the_longest_stretch_without_a_break_is_kept() {
    let settings = FocusSettings::default();
    let mut state = FocusState::default();
    // 90 minutes busy, a one-minute pause (not a break), 30 more, then away.
    run(&mut state, &settings, monday_at(9), 90, busy);
    run(
        &mut state,
        &settings,
        monday_at(9) + Duration::minutes(91),
        1,
        |_| 70,
    );
    run(
        &mut state,
        &settings,
        monday_at(9) + Duration::minutes(92),
        30,
        busy,
    );
    let away = monday_at(11) + Duration::minutes(3);
    run(&mut state, &settings, away, 5, |now| {
        u32::try_from((now - away).num_seconds()).unwrap()
    });
    // Back for 40 minutes: shorter, so the record stands.
    run(&mut state, &settings, monday_at(12), 40, busy);

    let longest = state.today.as_ref().unwrap().longest_stretch_seconds;
    assert!((120 * 60..=125 * 60).contains(&longest), "{longest}");
}

/// The card's numbers: averages over days actually used, breaks across both
/// kinds, and the goal counted per day.
#[test]
fn the_week_adds_up() {
    let mut settings = FocusSettings::default();
    settings.eyes.enabled = true;
    let mut state = FocusState::default();
    let monday = monday_at(10);
    run(&mut state, &settings, monday, 60, busy);
    log_water(&mut state, monday.naive_utc(), 10);
    let tuesday = monday + Duration::days(1);
    run(&mut state, &settings, tuesday, 120, busy);

    let view = snapshot(&mut state, &settings, tuesday, tuesday.naive_utc());
    let week = &view.summary;
    assert_eq!(week.days.len(), 7);
    assert!(week.days[6].today);
    assert_eq!(week.days[6].weekday, 2, "Tuesday");
    assert_eq!(week.tracked_days, 2);
    assert!((85 * 60..=95 * 60).contains(&week.average_screen_seconds));
    assert!(week.breaks_reminded >= 8);
    assert_eq!(week.water_goal_days, 1);
    let stretch = week.longest_stretch.clone().expect("a stretch");
    assert!(stretch.today);
}

// ------------------------------------------------------------------ jokes

const DECKS: [BreakKind; 8] = [
    BreakKind::Eyes,
    BreakKind::Move,
    BreakKind::Water,
    BreakKind::EndOfDay,
    BreakKind::Breakfast,
    BreakKind::Lunch,
    BreakKind::Dinner,
    BreakKind::Bedtime,
];

fn every_deck() -> impl Iterator<Item = (&'static str, &'static [jokes::Line])> {
    DECKS
        .iter()
        .map(|kind| (jokes::deck_name(*kind), jokes::lines(*kind)))
        .chain([(jokes::DONE_DECK, jokes::DONE)])
}

fn in_deck(deck: &[jokes::Line], joke: &jokes::Joke) -> bool {
    deck.iter().any(|(en, ne)| *en == joke.en && *ne == joke.ne)
}

#[test]
fn every_deck_is_big_enough_short_enough_and_has_no_twins() {
    for (name, lines) in every_deck() {
        assert!(
            lines.len() >= jokes::MIN_DECK,
            "{name} is too small to rotate"
        );
        let english: HashSet<_> = lines.iter().map(|(en, _)| en).collect();
        let nepali: HashSet<_> = lines.iter().map(|(_, ne)| ne).collect();
        assert_eq!(english.len(), lines.len(), "{name} repeats an English line");
        assert_eq!(nepali.len(), lines.len(), "{name} repeats a Nepali line");
        for (en, ne) in lines {
            assert!(
                !en.trim().is_empty() && !ne.trim().is_empty(),
                "{name}: {en}"
            );
            assert!(
                en.chars().count() <= jokes::MAX_LINE,
                "{name} line is too long for the card: {en}"
            );
            assert!(
                ne.chars().any(|c| ('\u{0900}'..='\u{097F}').contains(&c)),
                "{name} has no Nepali for: {en}"
            );
        }
    }
    assert!(
        jokes::lines(BreakKind::Custom).is_empty(),
        "the user's own words stay theirs"
    );
}

/// The jokes are about the day at the desk, never about anyone's family.
#[test]
fn no_joke_mentions_family() {
    const ENGLISH: [&str; 16] = [
        "aama", "ama ", "baa", "buwa", "mother", "father", "mom", "dad", "family", "dai", "didi",
        "aunty", "uncle", "cousin", "relative", "hajur",
    ];
    // Matched at the start of a word, so a suffix like -ले still counts but
    // a word that merely contains the letters (निदाइसके) does not.
    const NEPALI: [&str; 9] = [
        "आमा",
        "बुबा",
        "बाबा",
        "दाइ",
        "दिदी",
        "हजुर",
        "परिवार",
        "काका",
        "माइजु",
    ];
    for (name, lines) in every_deck() {
        for (en, ne) in lines {
            let lower = en.to_lowercase();
            for word in ENGLISH {
                let hit = lower
                    .split(|c: char| !c.is_alphabetic())
                    .any(|token| token == word.trim());
                assert!(!hit, "{name} mentions \"{}\": {en}", word.trim());
            }
            let words: Vec<&str> = ne
                .split(|c: char| c.is_whitespace() || "।,?!.'\"".contains(c))
                .collect();
            for word in NEPALI {
                let hit = words.iter().any(|token| token.starts_with(word));
                assert!(!hit, "{name} mentions \"{word}\": {ne}");
            }
        }
    }
}

/// Every line comes up once per round, and no line ever follows itself,
/// not even where one round ends and the next begins.
#[test]
fn a_deck_deals_every_line_before_repeating_and_never_twice_in_a_row() {
    for (name, lines) in every_deck() {
        let len = lines.len();
        let dealt: Vec<usize> = (0..(len * 6) as u32)
            .map(|turn| jokes::position(name, turn, len))
            .collect();
        for round in dealt.chunks(len) {
            let seen: HashSet<_> = round.iter().collect();
            assert_eq!(seen.len(), len, "{name} skipped a line in a round");
        }
        assert!(
            dealt.windows(2).all(|pair| pair[0] != pair[1]),
            "{name} dealt the same line twice in a row"
        );
        assert_ne!(
            dealt[..len],
            dealt[len..len * 2],
            "{name} rounds should reshuffle"
        );
    }
}

#[test]
fn each_card_brings_a_new_joke_and_a_cheer_when_jokes_are_on() {
    let settings = eyes_only();
    let mut state = FocusState::default();
    let mut seen = Vec::new();
    let mut now = monday_at(10);
    for _ in 0..5 {
        run(&mut state, &settings, now, 20, busy);
        let card = state
            .active_break
            .clone()
            .expect("a card when it comes due");
        let joke = card.joke.expect("jokes are on by default");
        assert!(in_deck(jokes::EYES, &joke));
        assert!(card.cheer.is_some_and(|line| in_deck(jokes::DONE, &line)));
        seen.push(joke.en);
        finish_break(
            &mut state,
            &settings,
            BreakOutcome::Done,
            card.started_at.naive_utc(),
        );
        now = card.started_at + Duration::seconds(STEP);
    }
    let unique: HashSet<_> = seen.iter().collect();
    assert_eq!(
        unique.len(),
        seen.len(),
        "a joke came back too soon: {seen:?}"
    );

    let mut plain = eyes_only();
    plain.jokes = false;
    let mut state = FocusState::default();
    run(&mut state, &plain, monday_at(10), 20, busy);
    let card = state.active_break.expect("a card is showing");
    assert_eq!((card.joke, card.cheer), (None, None));
    assert!(state.jokes_told.is_empty());
}

#[test]
fn a_notification_says_the_joke_and_keeps_the_water_total() {
    let mut settings = FocusSettings {
        style: ReminderStyle::Notification,
        ..FocusSettings::default()
    };
    let mut state = FocusState::default();
    run(&mut state, &settings, monday_at(10), 1, busy);
    let today = state.today.clone().unwrap();
    let say = |state: &mut FocusState, settings: &FocusSettings, kind, language| {
        announcement(state, settings, kind, &today, language)
    };

    let (title, body) = say(&mut state, &settings, BreakKind::Move, Language::En);
    assert_eq!(title, "Time to move");
    assert!(jokes::MOVE.iter().any(|(en, _)| *en == body), "{body}");
    let (_, again) = say(&mut state, &settings, BreakKind::Move, Language::En);
    assert_ne!(body, again, "two notifications in a row say the same thing");

    let (_, water) = say(&mut state, &settings, BreakKind::Water, Language::En);
    let (joke, total) = water.split_once('\n').expect("the joke, then the total");
    assert!(jokes::WATER.iter().any(|(en, _)| *en == joke));
    assert_eq!(total, "0 of 2.5 litres today.");

    let (title, water) = say(&mut state, &settings, BreakKind::Water, Language::Ne);
    assert_eq!(title, "पानी पिउनुहोस्");
    let (joke, total) = water.split_once('\n').expect("the joke, then the total");
    assert!(jokes::WATER.iter().any(|(_, ne)| *ne == joke), "{joke}");
    assert_eq!(total, "आज २.५ मध्ये ० लिटर।");

    let (_, custom) = say(&mut state, &settings, BreakKind::Custom, Language::En);
    assert_eq!(custom, "Your own reminder, from Sajilo.");

    settings.jokes = false;
    let (_, plain) = say(&mut state, &settings, BreakKind::Eyes, Language::En);
    assert_eq!(
        plain,
        "Look at something about 6 metres away for 20 seconds."
    );
    let (title, plain) = say(&mut state, &settings, BreakKind::Eyes, Language::Ne);
    assert_eq!(
        (title.as_str(), plain.as_str()),
        ("टाढा हेर्नुहोस्", "२० सेकेन्ड ६ मिटर जति टाढाको कुनै चीज हेर्नुहोस्।")
    );
}

// ------------------------------------------------------------ watching

/// Forty minutes of a video with hands off the keyboard: input idle climbs
/// the whole time, but the held display says someone is watching.
fn watch_film(state: &mut FocusState, settings: &FocusSettings, held: bool) -> Vec<BreakKind> {
    let start = monday_at(10);
    let mut due = Vec::new();
    let mut now = start;
    while now <= start + Duration::minutes(40) {
        let idle = u32::try_from((now - start).num_seconds()).unwrap();
        let tick_at = if held {
            watching(now, idle)
        } else {
            at(now, idle)
        };
        due.extend(tick(state, settings, tick_at));
        now += Duration::seconds(STEP);
    }
    due
}

#[test]
fn watching_a_video_counts_as_screen_time_and_still_rests_the_eyes() {
    let mut state = FocusState::default();
    let due = watch_film(&mut state, &eyes_only(), true);
    let today = state.today.as_ref().unwrap();
    assert!(today.screen_seconds >= 39 * 60, "{}", today.screen_seconds);
    assert!(
        due.contains(&BreakKind::Eyes),
        "the 20-20-20 reminder comes mid-film"
    );

    let view = snapshot(
        &mut state,
        &eyes_only(),
        monday_at(10) + Duration::minutes(40),
        (monday_at(10) + Duration::minutes(40)).naive_utc(),
    );
    assert_eq!(view.status, FocusStatus::Active, "watching is not away");
}

#[test]
fn without_a_held_display_the_same_film_reads_as_away() {
    let mut state = FocusState::default();
    let due = watch_film(&mut state, &eyes_only(), false);
    let today = state.today.as_ref().unwrap();
    assert!(today.screen_seconds <= 2 * 60, "{}", today.screen_seconds);
    assert!(due.is_empty());
}

/// A held display cannot turn a sleeping laptop into screen time.
#[test]
fn a_held_display_does_not_count_the_time_the_computer_slept() {
    let mut state = FocusState::default();
    let settings = eyes_only();
    tick(&mut state, &settings, watching(monday_at(10), 0));
    tick(&mut state, &settings, watching(monday_at(11), 0));
    assert_eq!(state.today.as_ref().unwrap().screen_seconds, 0);
}

#[test]
fn a_held_display_keeps_an_unmeasurable_idle_unmeasured() {
    let mut state = FocusState::default();
    let tick_at = Tick {
        idle_seconds: None,
        ..watching(monday_at(10), 0)
    };
    tick(&mut state, &eyes_only(), tick_at);
    assert_eq!(state.last_idle, None);
}
