//! Break reminders and screen time, walked through simulated workdays.

use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Utc, Weekday};
use sajilo_core::focus::{
    BreakKind, FocusSettings, FocusState, FocusStatus, PauseChoice, Tick, log_water, pause,
    snapshot, tick,
};

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
    let mut state = FocusState::default();
    let evening = monday_at(19);
    assert!(run(&mut state, &eyes_only(), evening, 60, busy).is_empty());
    assert!(state.today.as_ref().unwrap().screen_seconds >= 59 * 60);

    let view = snapshot(&mut state, &eyes_only(), evening, evening.naive_utc());
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
    settings.water_goal = 2;
    let mut state = FocusState::default();
    let start = monday_at(9);
    log_water(&mut state, start.naive_utc(), 2);

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
        serde_json::from_str(r#"{"eyes":{"enabled":true,"everyMinutes":7},"waterGoal":0}"#)
            .unwrap();
    let odd = odd.normalised();
    assert_eq!(odd.eyes.every_minutes, 20);
    assert_eq!(odd.water_goal, 1);
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
