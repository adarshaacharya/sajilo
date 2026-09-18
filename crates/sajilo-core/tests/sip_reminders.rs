//! SIP payment reminders. Every rule is specified in Nepal time.

use chrono::{TimeZone, Utc};
use sajilo_core::nepal_time;
use sajilo_core::notify::{NotificationOptions, SIP_REMINDER_HOUR, plan_sip_payments};
use sajilo_core::sip::{SipPlan, mark_paid};

fn nepal(month: u32, day: u32, hour: u32) -> chrono::DateTime<Utc> {
    nepal_time::offset()
        .with_ymd_and_hms(2026, month, day, hour, 0, 0)
        .unwrap()
        .with_timezone(&Utc)
}

fn sip(day: u32) -> SipPlan {
    SipPlan {
        symbol: "NIBLSF".into(),
        name: "NIBL Sahabhagita Fund".into(),
        day,
        amount: Some(5_000.0),
        paid_month: None,
        remind_on: None,
    }
}

#[test]
fn reminds_three_days_ahead_and_on_the_day_in_the_morning() {
    let planned = plan_sip_payments(&[sip(15)], NotificationOptions::default(), nepal(9, 10, 8));
    let fires: Vec<_> = planned.iter().map(|n| n.fire_at).collect();
    assert_eq!(
        fires,
        [
            nepal(9, 12, SIP_REMINDER_HOUR),
            nepal(9, 15, SIP_REMINDER_HOUR)
        ]
    );
    assert_eq!(planned[0].title, "SIP due in 3 days");
    assert_eq!(
        planned[0].body,
        "NIBL Sahabhagita Fund · Rs 5,000 on Tue, Sep 15"
    );
    assert_eq!(planned[1].title, "SIP due today");
}

#[test]
fn ids_are_per_fund_per_month_so_a_replan_replaces_rather_than_repeats() {
    let first = plan_sip_payments(&[sip(15)], NotificationOptions::default(), nepal(9, 10, 8));
    let again = plan_sip_payments(&[sip(15)], NotificationOptions::default(), nepal(9, 11, 8));
    assert_eq!(first, again);
    assert_eq!(first[1].id, "sajilo.sip.NIBLSF.2026-09.due");
}

#[test]
fn a_payment_marked_paid_is_not_reminded_about() {
    let mut plan = sip(15);
    mark_paid(&mut plan, nepal(9, 13, 8).date_naive());
    let planned = plan_sip_payments(&[plan], NotificationOptions::default(), nepal(9, 13, 8));
    // Only next month's pair is left.
    assert!(
        planned.iter().all(|n| n.id.contains("2026-10")),
        "{planned:?}"
    );
}

#[test]
fn remind_tomorrow_adds_one_more_reminder_on_that_day() {
    let mut plan = sip(15);
    plan.remind_on = Some("2026-09-16".into());
    let planned = plan_sip_payments(&[plan], NotificationOptions::default(), nepal(9, 15, 10));
    let again = planned
        .iter()
        .find(|n| n.id.ends_with("again.2026-09-16"))
        .expect("a reminder on the 16th");
    assert_eq!(again.fire_at, nepal(9, 16, SIP_REMINDER_HOUR));
    assert_eq!(again.title, "SIP still to pay");
}

#[test]
fn the_master_switch_silences_every_fund() {
    let off = NotificationOptions {
        sip_payment: false,
        ..NotificationOptions::default()
    };
    assert!(plan_sip_payments(&[sip(15)], off, nepal(9, 10, 8)).is_empty());
}

#[test]
fn an_amount_left_out_is_left_out_of_the_reminder() {
    let mut plan = sip(15);
    plan.amount = None;
    let planned = plan_sip_payments(&[plan], NotificationOptions::default(), nepal(9, 10, 8));
    assert_eq!(planned[0].body, "NIBL Sahabhagita Fund on Tue, Sep 15");
}
