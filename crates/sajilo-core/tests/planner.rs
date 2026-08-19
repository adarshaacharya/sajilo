//! Day-plan recurrence and ordering. Derived from `DayPlan.swift`.

use chrono::{TimeZone, Utc};
use sajilo_core::NepaliDate;
use sajilo_core::planner::{DayPlan, PlanTime, Recurrence, Reminder, ordered, plans_on};

fn plan(id: &str, date: NepaliDate, time: Option<(u32, u32)>, created: i64) -> DayPlan {
    DayPlan {
        id: id.to_owned(),
        date,
        title: id.to_owned(),
        time: time.map(|(hour, minute)| PlanTime { hour, minute }),
        reminder: None,
        note: String::new(),
        recurrence: Recurrence::None,
        created_at: Utc.timestamp_opt(created, 0).unwrap(),
    }
}

#[test]
fn a_one_time_plan_occurs_only_on_its_own_date() {
    let date = NepaliDate::new(2083, 4, 15);
    let plan = plan("a", date, None, 0);

    assert!(plan.occurs_on(date));
    assert!(!plan.occurs_on(NepaliDate::new(2084, 4, 15)));
    assert_eq!(plan.occurrence(2084), None);
}

/// A yearly date keeps its BS month and day and is resolved per year, rather
/// than pre-creating duplicate plans.
#[test]
fn a_yearly_plan_recurs_on_the_same_bikram_sambat_day() {
    let mut plan = plan("birthday", NepaliDate::new(2080, 4, 15), None, 0);
    plan.recurrence = Recurrence::YearlyBikramSambat;

    assert!(plan.occurs_on(NepaliDate::new(2080, 4, 15)));
    assert!(plan.occurs_on(NepaliDate::new(2083, 4, 15)));
    assert!(!plan.occurs_on(NepaliDate::new(2083, 4, 16)));
    // Never before the year it was created in.
    assert_eq!(plan.occurrence(2079), None);
}

/// BS months vary between 29 and 32 days. A plan on the 32nd must still fire in
/// a year where that month is shorter, rather than silently vanishing.
#[test]
fn a_yearly_plan_is_clamped_to_a_shorter_month() {
    use sajilo_core::calendar::bikram_sambat::days_in_month;

    // BS 2083-03 has 32 days; find a later year where month 3 is shorter.
    assert_eq!(days_in_month(2083, 3), Some(32));
    let mut plan = plan("long", NepaliDate::new(2083, 3, 32), None, 0);
    plan.recurrence = Recurrence::YearlyBikramSambat;

    let shorter = (2084..=2090)
        .find(|year| days_in_month(*year, 3).is_some_and(|days| days < 32))
        .expect("some later year has a shorter month 3");
    let length = days_in_month(shorter, 3).unwrap() as u32;

    let occurrence = plan.occurrence(shorter).expect("it still occurs");
    assert_eq!(occurrence.day, length, "clamped to the last real day");
    assert!(plan.occurs_on(occurrence));
}

/// Timed plans lead in clock order; untimed ones follow, oldest first.
#[test]
fn orders_timed_plans_before_untimed_ones() {
    let date = NepaliDate::new(2083, 4, 15);
    let mut plans = vec![
        plan("untimed-late", date, None, 200),
        plan("nine", date, Some((9, 0)), 10),
        plan("untimed-early", date, None, 100),
        plan("seven-thirty", date, Some((7, 30)), 20),
    ];
    ordered(&mut plans);

    assert_eq!(
        plans.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
        ["seven-thirty", "nine", "untimed-early", "untimed-late"]
    );
}

/// Equal times fall back to creation order, so a re-render cannot reshuffle.
#[test]
fn the_order_is_stable_on_equal_times() {
    let date = NepaliDate::new(2083, 4, 15);
    let mut plans = vec![
        plan("second", date, Some((9, 0)), 200),
        plan("first", date, Some((9, 0)), 100),
    ];
    ordered(&mut plans);
    assert_eq!(
        plans.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
        ["first", "second"]
    );
}

#[test]
fn collects_only_the_plans_falling_on_a_day() {
    let target = NepaliDate::new(2083, 4, 15);
    let mut yearly = plan("yearly", NepaliDate::new(2080, 4, 15), Some((8, 0)), 0);
    yearly.recurrence = Recurrence::YearlyBikramSambat;

    let plans = vec![
        plan("today", target, None, 50),
        plan("other-day", NepaliDate::new(2083, 4, 16), None, 60),
        yearly,
    ];

    let matching = plans_on(&plans, target);
    assert_eq!(
        matching.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
        ["yearly", "today"],
        "timed plan leads, and the wrong day is excluded"
    );
}

/// A reminder with no time has nothing to count back from.
#[test]
fn a_reminder_without_a_time_is_dropped() {
    let mut untimed = plan("a", NepaliDate::new(2083, 4, 15), None, 0);
    untimed.reminder = Some(Reminder(15));
    assert_eq!(untimed.normalised().reminder, None);

    let mut timed = plan("b", NepaliDate::new(2083, 4, 15), Some((9, 0)), 0);
    timed.reminder = Some(Reminder(15));
    assert_eq!(timed.normalised().reminder, Some(Reminder(15)));
}

/// Plans written before recurrence existed have no such field, and must decode
/// as one-time rather than failing to load at all.
#[test]
fn older_stored_plans_decode_as_one_time() {
    let raw = r#"{
        "id": "legacy",
        "date": { "year": 2083, "month": 4, "day": 15 },
        "title": "Old plan",
        "time": null,
        "reminder": null,
        "note": "",
        "createdAt": "2026-08-17T00:00:00Z"
    }"#;
    let plan: DayPlan = serde_json::from_str(raw).expect("legacy plans still load");
    assert_eq!(plan.recurrence, Recurrence::None);
    assert_eq!(plan.title, "Old plan");
}
