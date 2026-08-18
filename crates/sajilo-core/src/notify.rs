//! Turning festivals and day plans into scheduled reminders.
//!
//! Ported from `FestivalNotificationPlanner.swift` and
//! `DayPlanReminderPlanner.swift`, and deliberately pure: no notification
//! framework, no clock of its own. Every rule that is easy to get wrong — never
//! scheduling into the past, one reminder per day rather than per festival,
//! stable identifiers so rescheduling replaces rather than duplicates — is
//! testable without granting a permission or waiting for a date to arrive.

use std::collections::BTreeMap;

use chrono::{DateTime, Duration, TimeZone, Utc};
use serde::{Deserialize, Serialize};

use crate::calendar::bikram_sambat::{LAST_YEAR, gregorian_date_from, nepali_date_from};
use crate::calendar::nepali_date::NepaliDate;
use crate::calendar::upcoming::UpcomingEvent;
use crate::nepal_time;
use crate::planner::{DayPlan, Recurrence};

/// Everything is off until the user says otherwise: notifications are opt-in and
/// individually configurable, and permission is asked for only once one of these
/// is switched on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationOptions {
    #[serde(default)]
    pub eve_of_public_holiday: bool,
    #[serde(default)]
    pub eve_of_festival: bool,
    /// Evening before, in Nepal time. Late enough to read as "tomorrow", early
    /// enough not to arrive after the user has gone to bed.
    #[serde(default = "default_hour")]
    pub hour: u32,
}

fn default_hour() -> u32 {
    19
}

impl Default for NotificationOptions {
    fn default() -> Self {
        Self {
            eve_of_public_holiday: false,
            eve_of_festival: false,
            hour: default_hour(),
        }
    }
}

impl NotificationOptions {
    pub fn is_any_enabled(&self) -> bool {
        self.eve_of_public_holiday || self.eve_of_festival
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedNotification {
    pub id: String,
    pub title: String,
    pub body: String,
    pub fire_at: DateTime<Utc>,
}

/// Platform notification centres cap pending local notifications — macOS at 64.
/// Staying well under leaves headroom for both planners, and there is no value
/// in scheduling a year out.
pub const LIMIT: usize = 30;

/// Fires within this window of a missed reminder still go out on startup. A
/// laptop shut overnight should still surface this morning's plan; a reminder
/// from last week should not arrive as a surprise.
pub const LATE_FIRE_WINDOW_HOURS: i64 = 6;

/// Festival and holiday reminders, one per date.
pub fn plan_festivals(
    events: &[UpcomingEvent],
    options: NotificationOptions,
    now: DateTime<Utc>,
) -> Vec<PlannedNotification> {
    if !options.is_any_enabled() {
        return Vec::new();
    }

    // Several festivals can share a date; one reminder listing them beats three
    // notifications firing at the same instant. `BTreeMap` also gives the
    // chronological order the limit is applied in.
    let mut by_date: BTreeMap<NepaliDate, Vec<&UpcomingEvent>> = BTreeMap::new();
    for event in events.iter().filter(|event| matches(event, options)) {
        by_date.entry(event.date).or_default().push(event);
    }

    by_date
        .into_iter()
        .filter_map(|(date, same_day)| {
            let first = same_day.first()?;
            let fire_at = eve_of(first.gregorian, options.hour)?;
            if fire_at <= now {
                return None;
            }
            let is_holiday = same_day.iter().any(|event| event.is_public_holiday);
            Some(PlannedNotification {
                id: festival_id(date),
                title: if is_holiday {
                    "Public holiday tomorrow".to_owned()
                } else {
                    "Festival tomorrow".to_owned()
                },
                body: same_day
                    .iter()
                    .map(|event| event.name.as_str())
                    .collect::<Vec<_>>()
                    .join(" · "),
                fire_at,
            })
        })
        .take(LIMIT)
        .collect()
}

/// Stable across replans, so rescheduling overwrites the previous request for a
/// date instead of stacking another one beside it.
pub fn festival_id(date: NepaliDate) -> String {
    format!("sajilo.festival.{}-{}-{}", date.year, date.month, date.day)
}

fn matches(event: &UpcomingEvent, options: NotificationOptions) -> bool {
    if event.is_public_holiday {
        options.eve_of_public_holiday
    } else {
        options.eve_of_festival
    }
}

/// The evening before `date`, at `hour` Nepal time.
fn eve_of(date: chrono::NaiveDate, hour: u32) -> Option<DateTime<Utc>> {
    let eve = date.pred_opt()?;
    at_nepal_time(eve, hour, 0)
}

fn at_nepal_time(date: chrono::NaiveDate, hour: u32, minute: u32) -> Option<DateTime<Utc>> {
    let naive = date.and_hms_opt(hour.min(23), minute.min(59), 0)?;
    nepal_time::offset()
        .from_local_datetime(&naive)
        .single()
        .map(|value| value.with_timezone(&Utc))
}

/// Reminders for timed day plans, soonest first.
pub fn plan_day_plans(plans: &[DayPlan], now: DateTime<Utc>) -> Vec<PlannedNotification> {
    let mut planned: Vec<PlannedNotification> = plans
        .iter()
        .filter_map(|plan| next_for_plan(plan, now))
        .collect();
    planned.sort_by_key(|notification| notification.fire_at);
    planned.truncate(LIMIT);
    planned
}

fn next_for_plan(plan: &DayPlan, now: DateTime<Utc>) -> Option<PlannedNotification> {
    // A plan with no time has nothing to count back from.
    plan.time?;
    plan.reminder?;

    match plan.recurrence {
        Recurrence::None => notification_for(plan, plan.date, now),
        Recurrence::YearlyBikramSambat => {
            // Walk forward from this year: a yearly plan whose date has passed
            // should schedule next year's occurrence, not nothing.
            let today =
                nepali_date_from(now.with_timezone(&nepal_time::offset()).date_naive()).ok()?;
            let start = today.year.max(plan.date.year);
            (start..=LAST_YEAR).find_map(|year| {
                let occurrence = plan.occurrence(year)?;
                notification_for(plan, occurrence, now)
            })
        }
    }
}

fn notification_for(
    plan: &DayPlan,
    date: NepaliDate,
    now: DateTime<Utc>,
) -> Option<PlannedNotification> {
    let time = plan.time?;
    let reminder = plan.reminder?;
    let day = gregorian_date_from(date).ok()?;
    let event_at = at_nepal_time(day, time.hour, time.minute)?;
    let fire_at = event_at - Duration::minutes(i64::from(reminder.0));
    if fire_at <= now {
        return None;
    }

    // A yearly plan needs one id per occurrence, or next year's reminder would
    // replace this year's.
    let suffix = if plan.recurrence == Recurrence::YearlyBikramSambat {
        format!(".{}", date.year)
    } else {
        String::new()
    };
    Some(PlannedNotification {
        id: format!("sajilo.plan.{}{}", plan.id, suffix),
        title: plan.title.clone(),
        body: if plan.note.is_empty() {
            "Sajilo day plan".to_owned()
        } else {
            plan.note.clone()
        },
        fire_at,
    })
}

/// What was last delivered, persisted so a restart cannot re-fire a reminder.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastFired {
    /// Notification id → when it was delivered.
    #[serde(default)]
    pub entries: BTreeMap<String, DateTime<Utc>>,
}

impl LastFired {
    pub fn was_fired(&self, id: &str) -> bool {
        self.entries.contains_key(id)
    }

    pub fn record(&mut self, id: &str, at: DateTime<Utc>) {
        self.entries.insert(id.to_owned(), at);
    }

    /// Drops entries older than a month. Without this the record grows for the
    /// life of the install, and nothing needs to remember last year's festival.
    pub fn prune(&mut self, now: DateTime<Utc>) {
        let cutoff = now - Duration::days(31);
        self.entries.retain(|_, fired| *fired > cutoff);
    }
}

/// Whether a reminder whose time has already passed should still be delivered.
///
/// A laptop shut overnight should still surface this morning's plan; a reminder
/// from last week should not arrive as a surprise. Anything past the window is
/// skipped silently rather than queued.
pub fn should_fire_late(
    notification: &PlannedNotification,
    now: DateTime<Utc>,
    fired: &LastFired,
) -> bool {
    if fired.was_fired(&notification.id) {
        return false;
    }
    if notification.fire_at > now {
        return false;
    }
    (now - notification.fire_at) <= Duration::hours(LATE_FIRE_WINDOW_HOURS)
}

/// When the scheduler should next wake: the soonest future fire time.
///
/// `None` means nothing is pending, and the scheduler can sleep until a
/// preference or a plan changes rather than polling.
pub fn next_wake(
    notifications: &[PlannedNotification],
    now: DateTime<Utc>,
) -> Option<DateTime<Utc>> {
    notifications
        .iter()
        .map(|notification| notification.fire_at)
        .filter(|fire_at| *fire_at > now)
        .min()
}
