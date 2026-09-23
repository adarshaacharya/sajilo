//! Turning festivals and day plans into scheduled reminders.
//!
//! Ported from `FestivalNotificationPlanner.swift` and
//! `DayPlanReminderPlanner.swift`, and deliberately pure: no notification
//! framework, no clock of its own. Every rule that is easy to get wrong — never
//! scheduling into the past, one reminder per day rather than per festival,
//! stable identifiers so rescheduling replaces rather than duplicates — is
//! testable without granting a permission or waiting for a date to arrive.

use std::collections::BTreeMap;

use chrono::{DateTime, Duration, NaiveDate, TimeZone, Utc};
use serde::{Deserialize, Serialize};

use crate::calendar::bikram_sambat::{LAST_YEAR, gregorian_date_from, nepali_date_from};
use crate::calendar::nepali_date::NepaliDate;
use crate::calendar::upcoming::UpcomingEvent;
use crate::nepal_time;
use crate::planner::{DayPlan, Recurrence};

/// Every reminder starts on: a holiday or festival tomorrow and an IPO closing
/// today are what people open a Nepali calendar to find out, and each fires at
/// most once a day. Every toggle stays individually configurable, and a choice
/// the user has saved is always kept.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationOptions {
    #[serde(default = "enabled_by_default")]
    pub eve_of_public_holiday: bool,
    #[serde(default = "enabled_by_default")]
    pub eve_of_festival: bool,
    /// Evening before, in Nepal time. Late enough to read as "tomorrow", early
    /// enough not to arrive after the user has gone to bed.
    #[serde(default = "default_hour")]
    pub hour: u32,
    /// The morning an IPO the user can still apply to closes.
    #[serde(default = "enabled_by_default")]
    pub ipo_closing_day: bool,
    /// SIP payments the user set a reminder for, three days ahead and on the
    /// day. On by default: each fund's reminder is itself opt-in, so this is
    /// only the switch that silences them all at once.
    #[serde(default = "enabled_by_default")]
    pub sip_payment: bool,
}

fn default_hour() -> u32 {
    19
}

/// Also what a field missing from saved options reads as, so options stored
/// before a reminder existed pick up its default.
fn enabled_by_default() -> bool {
    true
}

impl Default for NotificationOptions {
    fn default() -> Self {
        Self {
            eve_of_public_holiday: enabled_by_default(),
            eve_of_festival: enabled_by_default(),
            hour: default_hour(),
            ipo_closing_day: enabled_by_default(),
            sip_payment: enabled_by_default(),
        }
    }
}

impl NotificationOptions {
    pub fn is_any_enabled(&self) -> bool {
        self.festivals_enabled() || self.ipo_closing_day || self.sip_payment
    }

    fn festivals_enabled(self) -> bool {
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

/// Whether a reminder due at `fire_at` can still be delivered at `now`: it is
/// still ahead, or it came due within the late window.
///
/// Every planner keeps both. The scheduler wakes a moment *after* a fire time
/// and replans before it delivers, so a planner that dropped everything at or
/// before `now` would drop the very reminder the scheduler woke up for — and
/// nothing would ever be delivered. `LastFired` is what stops a kept reminder
/// from firing twice.
pub fn still_deliverable(fire_at: DateTime<Utc>, now: DateTime<Utc>) -> bool {
    now - fire_at <= Duration::hours(LATE_FIRE_WINDOW_HOURS)
}

/// Festival and holiday reminders, one per date.
pub fn plan_festivals(
    events: &[UpcomingEvent],
    options: NotificationOptions,
    now: DateTime<Utc>,
) -> Vec<PlannedNotification> {
    if !options.festivals_enabled() {
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
            if !still_deliverable(fire_at, now) {
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

/// The morning of closing day, Nepal time: early enough to leave the working
/// day to apply, late enough to be read rather than slept through.
pub const IPO_CLOSING_HOUR: u32 = 10;

/// An issue the user could still apply to, as the desktop shell hands it over.
///
/// Core knows nothing of CDSC. By the time an issue reaches here the shell has
/// already dropped the ones not open to the general public and the ones the
/// user marked as applied.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IpoDeadline {
    /// What the notification calls it: the symbol when CDSC gives one.
    pub name: String,
    pub close_date: NaiveDate,
}

/// One closing-day reminder per date, listing every issue that closes then.
///
/// `fetched_at` is when the issue list was fetched. A reminder still ahead is
/// planned from any list, so the scheduler wakes for it on time. A reminder
/// already due goes out only on a list fetched that same Nepal day: CDSC closes
/// an oversubscribed issue early, and "closes today" about an issue that shut
/// yesterday is worse than no reminder at all.
pub fn plan_ipo_closing(
    deadlines: &[IpoDeadline],
    options: NotificationOptions,
    fetched_at: DateTime<Utc>,
    now: DateTime<Utc>,
) -> Vec<PlannedNotification> {
    if !options.ipo_closing_day {
        return Vec::new();
    }

    let today = now.with_timezone(&nepal_time::offset()).date_naive();
    let fetched_on = fetched_at.with_timezone(&nepal_time::offset()).date_naive();

    let mut by_date: BTreeMap<NaiveDate, Vec<&str>> = BTreeMap::new();
    for deadline in deadlines
        .iter()
        .filter(|deadline| deadline.close_date >= today)
    {
        let names = by_date.entry(deadline.close_date).or_default();
        if !names.contains(&deadline.name.as_str()) {
            names.push(deadline.name.as_str());
        }
    }

    by_date
        .into_iter()
        .filter_map(|(date, names)| {
            let fire_at = at_nepal_time(date, IPO_CLOSING_HOUR, 0)?;
            let due_on_stale_list = fire_at <= now && fetched_on != date;
            if due_on_stale_list || !still_deliverable(fire_at, now) {
                return None;
            }
            let (title, body) = match names.as_slice() {
                [one] => (
                    format!("{one} IPO closes today"),
                    "Last day to apply on MeroShare.".to_owned(),
                ),
                many => (
                    format!("{} IPOs close today", many.len()),
                    format!("{} · last day to apply on MeroShare.", many.join(", ")),
                ),
            };
            Some(PlannedNotification {
                id: ipo_closing_id(date),
                title,
                body,
                fire_at,
            })
        })
        .take(LIMIT)
        .collect()
}

/// When SIP reminders go out, Nepal time: early enough to pay the same day.
pub const SIP_REMINDER_HOUR: u32 = 9;

/// The reminders chosen for each payment, plus one on the day the user asked
/// to be reminded again. A payment marked paid has moved on to next month in
/// `sip::current_due`, so nothing is planned for it.
pub fn plan_sip_payments(
    plans: &[crate::sip::SipPlan],
    options: NotificationOptions,
    now: DateTime<Utc>,
) -> Vec<PlannedNotification> {
    use crate::sip::{current_due, month_key};
    use crate::tools::units::grouped_decimal;

    if !options.sip_payment {
        return Vec::new();
    }
    let today = now.with_timezone(&nepal_time::offset()).date_naive();
    let mut all = Vec::new();
    for plan in plans {
        let Some(due) = current_due(plan, today) else {
            continue;
        };
        let amount = plan
            .amount
            .filter(|amount| *amount > 0.0)
            .map(|amount| format!(" · Rs {}", grouped_decimal(amount, 0)))
            .unwrap_or_default();
        let on = due.format("%a, %b %-d");
        let key = format!("sajilo.sip.{}.{}", plan.symbol, month_key(due));

        let mut remind = |date: NaiveDate, suffix: &str, title: String| {
            if let Some(fire_at) = at_nepal_time(date, SIP_REMINDER_HOUR, 0)
                && still_deliverable(fire_at, now)
            {
                all.push(PlannedNotification {
                    id: format!("{key}.{suffix}"),
                    title,
                    body: format!("{}{amount} on {on}", plan.name),
                    fire_at,
                });
            }
        };
        for days in &plan.remind_days {
            let (suffix, title) = match days {
                0 => ("due".to_owned(), "SIP due today".to_owned()),
                1 => ("ahead.1".to_owned(), "SIP due tomorrow".to_owned()),
                days => (format!("ahead.{days}"), format!("SIP due in {days} days")),
            };
            remind(due - Duration::days(i64::from(*days)), &suffix, title);
        }
        if let Some(again) = plan
            .remind_on
            .as_deref()
            .and_then(|raw| NaiveDate::parse_from_str(raw, "%Y-%m-%d").ok())
            .filter(|again| *again > due)
        {
            remind(
                again,
                &format!("again.{again}"),
                "SIP still to pay".to_owned(),
            );
        }
    }
    all.sort_by_key(|notification| notification.fire_at);
    all.truncate(LIMIT);
    all
}

/// One id per closing date, so a replan after the list refreshes replaces the
/// reminder rather than adding a second one beside it.
pub fn ipo_closing_id(date: NaiveDate) -> String {
    format!("sajilo.ipo.close.{date}")
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

    if plan.recurrence == Recurrence::None {
        return notification_for(plan, plan.date, now);
    }
    // Walk forward month by month: a repeating plan whose date has passed
    // should schedule its next occurrence, not nothing. The walk starts a month
    // back so a reminder late on last month's final day can still go out late.
    let today = nepali_date_from(now.with_timezone(&nepal_time::offset()).date_naive()).ok()?;
    let previous = if today.month == 1 {
        (today.year - 1, 12)
    } else {
        (today.year, today.month - 1)
    };
    let (mut year, mut month) = previous.max((plan.date.year, plan.date.month));
    while year <= LAST_YEAR {
        if let Some(notification) = plan
            .occurrence_in(year, month)
            .and_then(|occurrence| notification_for(plan, occurrence, now))
        {
            return Some(notification);
        }
        (year, month) = if month == 12 {
            (year + 1, 1)
        } else {
            (year, month + 1)
        };
    }
    None
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
    if !still_deliverable(fire_at, now) {
        return None;
    }

    // A repeating plan needs one id per occurrence, or the next occurrence's
    // reminder would replace this one's.
    let suffix = match plan.recurrence {
        Recurrence::None => String::new(),
        Recurrence::MonthlyBikramSambat => format!(".{}.{}", date.year, date.month),
        Recurrence::YearlyBikramSambat => format!(".{}", date.year),
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
