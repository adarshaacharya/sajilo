//! The daily rashifal reminder, walked through simulated days.

use chrono::{DateTime, Duration, NaiveTime, TimeZone, Utc};
use sajilo_core::focus::Language;
use sajilo_core::planner::PlanTime;
use sajilo_core::rashifal::{
    DEFAULT_TIME, MorningState, SETTLE_MINUTES, Step, Tick, mark_read, reading_time, reminder_id,
    step, title,
};

const STEP: i64 = 15;

/// 2026-09-28 at `hour:minute`. The tests treat the computer's clock as UTC.
fn at(hour: u32, minute: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 9, 28, hour, minute, 0).unwrap()
}

fn seven() -> NaiveTime {
    NaiveTime::from_hms_opt(7, 0, 0).unwrap()
}

fn tick(now: DateTime<Utc>, idle: u32) -> Tick {
    Tick {
        now,
        local: now.naive_utc(),
        idle_seconds: Some(idle),
        held: false,
        reading_ready: true,
        at: seven(),
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

/// At the computer, pausing between bursts of typing.
fn busy(now: DateTime<Utc>) -> Tick {
    tick(now, 5)
}

#[test]
fn it_comes_at_its_time_and_only_once() {
    let mut state = MorningState::default();
    let shown = run(&mut state, at(6, 30), 60, busy).expect("shown at seven");
    assert_eq!(shown, at(7, 0));
    // Once a day, however long the day goes on.
    assert_eq!(run(&mut state, at(7, 31), 120, busy), None);
}

#[test]
fn away_at_its_time_it_comes_once_settled_back() {
    let mut state = MorningState::default();
    // Away from 6:00 until 10:30.
    let away = |now: DateTime<Utc>| {
        let idle = if now < at(10, 30) {
            u32::try_from((now - at(6, 0)).num_seconds()).unwrap()
        } else {
            5
        };
        tick(now, idle)
    };
    let shown = run(&mut state, at(6, 0), 300, away).expect("comes once back");
    let settle = Duration::minutes(SETTLE_MINUTES);
    assert!(
        shown >= at(10, 30) + settle && shown <= at(10, 31) + settle,
        "{shown}"
    );
}

#[test]
fn the_laptop_opened_after_its_time_waits_too() {
    let mut state = MorningState::default();
    // A tick at 6:00, then the laptop shut until 9:00: the gap is time away.
    assert_eq!(step(&mut state, busy(at(6, 0))), Step::Wait);
    let shown = run(&mut state, at(9, 0), 60, busy).expect("comes after settling");
    assert!(
        shown >= at(9, 0) + Duration::minutes(SETTLE_MINUTES),
        "{shown}"
    );
}

#[test]
fn too_late_and_the_day_is_skipped() {
    let mut state = MorningState::default();
    // Seven plus six hours: from 13:00 it is no longer that day's reading.
    // (The tests set the reading for 7:00.)
    assert_eq!(run(&mut state, at(13, 0), 120, busy), None);
}

#[test]
fn an_evening_time_never_spills_past_midnight() {
    let mut state = MorningState::default();
    let ten_pm = |now: DateTime<Utc>| Tick {
        at: NaiveTime::from_hms_opt(22, 0, 0).unwrap(),
        ..busy(now)
    };
    assert_eq!(run(&mut state, at(21, 50), 5, ten_pm), None);
    assert_eq!(run(&mut state, at(22, 0), 5, ten_pm), Some(at(22, 0)));
    let next_small_hours = at(1, 0) + Duration::days(1);
    assert_eq!(run(&mut state, next_small_hours, 60, ten_pm), None);
}

/// It never lands on a keystroke, but does not wait forever either.
#[test]
fn it_waits_for_a_pause_in_typing_up_to_a_minute() {
    let mut state = MorningState::default();
    let typing = |now: DateTime<Utc>| tick(now, 0);
    let shown = run(&mut state, at(7, 0), 30, typing).expect("shown anyway");
    assert!(shown - at(7, 0) >= Duration::seconds(60), "{shown}");
    assert!(shown - at(7, 0) <= Duration::seconds(60 + STEP), "{shown}");
}

#[test]
fn a_call_holds_it_back() {
    let mut state = MorningState::default();
    let on_call = |now: DateTime<Utc>| Tick {
        held: now < at(7, 30),
        ..busy(now)
    };
    let shown = run(&mut state, at(7, 0), 60, on_call).expect("after the call");
    assert!(shown >= at(7, 30), "{shown}");
}

#[test]
fn without_todays_reading_it_asks_for_one_and_never_shows_empty() {
    let mut state = MorningState::default();
    let mut asked = false;
    let mut now = at(7, 0);
    while now <= at(7, 30) {
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
fn reading_it_in_the_app_first_counts() {
    let mut state = MorningState::default();
    mark_read(&mut state, at(6, 30).naive_utc());
    assert_eq!(run(&mut state, at(7, 0), 60, busy), None);
    // Tomorrow is a new day.
    let tomorrow = at(7, 0) + Duration::days(1);
    assert!(run(&mut state, tomorrow, 30, busy).is_some());
}

#[test]
fn a_restart_keeps_the_day_done() {
    let mut state = MorningState::default();
    assert!(run(&mut state, at(7, 0), 3, busy).is_some());
    let stored = serde_json::to_string(&state).unwrap();
    let mut state: MorningState = serde_json::from_str(&stored).unwrap();
    assert_eq!(run(&mut state, at(8, 0), 30, busy), None);
}

#[test]
fn state_saved_by_the_older_morning_reminder_still_loads() {
    let old = r#"{"day":"2026-09-28","usedSeconds":120,"done":"2026-09-28","lastTick":null,"dueSince":null}"#;
    let state: MorningState = serde_json::from_str(old).unwrap();
    assert_eq!(state.done, Some(at(0, 0).date_naive()));
}

#[test]
fn the_saved_time_or_ten() {
    let ten = NaiveTime::from_hms_opt(10, 0, 0).unwrap();
    assert_eq!(reading_time(None), DEFAULT_TIME);
    assert_eq!(DEFAULT_TIME, ten);
    assert_eq!(
        reading_time(Some(PlanTime {
            hour: 6,
            minute: 30
        })),
        NaiveTime::from_hms_opt(6, 30, 0).unwrap()
    );
    // Outside 5:00–22:00, or not a time at all: the default.
    for hour in [3, 25] {
        assert_eq!(reading_time(Some(PlanTime { hour, minute: 0 })), ten);
    }
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
