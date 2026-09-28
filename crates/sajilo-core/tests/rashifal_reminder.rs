//! The daily rashifal reminder, walked through simulated mornings.

use chrono::{DateTime, Duration, TimeZone, Utc};
use sajilo_core::focus::Language;
use sajilo_core::rashifal::{
    MorningState, SETTLE_MINUTES, Step, Tick, mark_read, reminder_id, step, title,
};

const STEP: i64 = 15;

/// 2026-09-28 at `hour:minute`. The tests treat the computer's clock as UTC.
fn at(hour: u32, minute: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 9, 28, hour, minute, 0).unwrap()
}

fn tick(now: DateTime<Utc>, idle: u32) -> Tick {
    Tick {
        now,
        local: now.naive_utc(),
        idle_seconds: Some(idle),
        held: false,
        reading_ready: true,
    }
}

/// Ticks from `start` for `minutes`, returning when it first said Show.
fn run(
    state: &mut MorningState,
    start: DateTime<Utc>,
    minutes: i64,
    make: impl Fn(DateTime<Utc>) -> Tick,
) -> Option<DateTime<Utc>> {
    let mut now = start;
    let mut shown = None;
    while now <= start + Duration::minutes(minutes) {
        if step(state, make(now)) == Step::Show && shown.is_none() {
            shown = Some(now);
        }
        now += Duration::seconds(STEP);
    }
    shown
}

/// Busy at the keyboard, pausing between bursts.
fn busy(now: DateTime<Utc>) -> Tick {
    tick(now, 5)
}

#[test]
fn it_comes_after_five_minutes_of_use_and_only_once() {
    let mut state = MorningState::default();
    let shown = run(&mut state, at(9, 0), 60, busy).expect("shown in the first hour");
    let after = shown - at(9, 0);
    assert!(
        after >= Duration::minutes(i64::from(SETTLE_MINUTES))
            && after <= Duration::minutes(i64::from(SETTLE_MINUTES) + 1),
        "shown {after} after sitting down"
    );
    // Once a day, however long the morning goes on.
    assert_eq!(run(&mut state, at(10, 1), 60, busy), None);
}

/// Sitting down and then going to make chiya does not run the clock down.
#[test]
fn only_time_at_the_computer_counts() {
    let mut state = MorningState::default();
    // Two minutes of use, then twenty away.
    let away = |now: DateTime<Utc>| {
        let idle = if now < at(8, 2) {
            5
        } else {
            u32::try_from((now - at(8, 2)).num_seconds()).unwrap()
        };
        tick(now, idle)
    };
    assert_eq!(run(&mut state, at(8, 0), 22, away), None);
    let shown = run(&mut state, at(8, 22) + Duration::seconds(STEP), 30, busy)
        .expect("comes once back at the desk");
    assert!(shown - at(8, 22) <= Duration::minutes(4), "{shown}");
}

#[test]
fn nothing_before_five_or_after_noon() {
    let mut early = MorningState::default();
    // Up at 4:00: that hour of use is not the morning yet.
    let shown = run(&mut early, at(4, 0), 70, busy).expect("shown after five");
    // Give or take the one tick that straddles 5:00.
    assert!(shown >= at(5, 5) - Duration::seconds(STEP), "{shown}");

    let mut late = MorningState::default();
    assert_eq!(run(&mut late, at(12, 0), 120, busy), None);
}

#[test]
fn a_morning_that_runs_into_noon_is_skipped() {
    let mut state = MorningState::default();
    assert_eq!(run(&mut state, at(11, 57), 10, busy), None);
}

/// It never lands on a keystroke, but does not wait forever either.
#[test]
fn it_waits_for_a_pause_in_typing_up_to_a_minute() {
    let mut state = MorningState::default();
    let typing = |now: DateTime<Utc>| tick(now, 0);
    let shown = run(&mut state, at(9, 0), 30, typing).expect("shown anyway");
    let due = at(9, 0) + Duration::minutes(i64::from(SETTLE_MINUTES));
    assert!(shown - due >= Duration::seconds(60), "{shown}");
    assert!(shown - due <= Duration::seconds(60 + STEP), "{shown}");
}

#[test]
fn a_call_holds_it_back() {
    let mut state = MorningState::default();
    let on_call = |now: DateTime<Utc>| Tick {
        held: now < at(9, 30),
        ..busy(now)
    };
    let shown = run(&mut state, at(9, 0), 60, on_call).expect("after the call");
    assert!(shown >= at(9, 30), "{shown}");
}

#[test]
fn without_todays_reading_it_asks_for_one_and_never_shows_empty() {
    let mut state = MorningState::default();
    let mut asked = false;
    let mut now = at(9, 0);
    while now <= at(9, 30) {
        let result = step(
            &mut state,
            Tick {
                reading_ready: false,
                ..busy(now)
            },
        );
        assert_ne!(result, Step::Show);
        asked |= result == Step::NeedReading;
        now += Duration::seconds(STEP);
    }
    assert!(asked);
    // The reading arrives: it shows on the next tick.
    assert_eq!(step(&mut state, tick(now, 5)), Step::Show);
}

#[test]
fn reading_it_in_the_app_counts() {
    let mut state = MorningState::default();
    mark_read(&mut state, at(8, 0).naive_utc());
    assert_eq!(run(&mut state, at(8, 0), 60, busy), None);
    // Tomorrow is a new morning.
    let tomorrow = at(9, 0) + Duration::days(1);
    assert!(run(&mut state, tomorrow, 30, busy).is_some());
}

#[test]
fn a_restart_keeps_the_minutes_used_and_the_day_done() {
    let mut state = MorningState::default();
    assert_eq!(run(&mut state, at(9, 0), 3, busy), None);
    let stored = serde_json::to_string(&state).unwrap();
    let mut state: MorningState = serde_json::from_str(&stored).unwrap();
    let shown = run(&mut state, at(9, 3) + Duration::seconds(STEP), 10, busy)
        .expect("carries on from three minutes");
    assert!(shown <= at(9, 6), "{shown}");

    let stored = serde_json::to_string(&state).unwrap();
    let mut state: MorningState = serde_json::from_str(&stored).unwrap();
    assert_eq!(run(&mut state, at(10, 0), 30, busy), None);
}

#[test]
fn the_title_names_the_sign_in_the_apps_language() {
    assert_eq!(title("Mesh", "मेष", Language::En), "Today's rashifal · Mesh");
    assert_eq!(title("Mesh", "मेष", Language::Ne), "आजको राशिफल · मेष");
    assert_eq!(
        reminder_id(at(9, 0).date_naive()),
        "sajilo.rashifal.2026-09-28"
    );
}
