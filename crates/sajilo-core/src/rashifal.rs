//! The daily rashifal reminder: today's reading for the user's own sign,
//! shown when they first sit down at the computer in the morning.
//!
//! A desktop app cannot reach anyone at a fixed hour: at 7:00 the laptop is
//! shut, and a 7:00 reminder then lands at 10:30 in the middle of a meeting.
//! So the moment is the user's own arrival instead. After [`EARLIEST`], the
//! first [`SETTLE_MINUTES`] of real use are left alone (logging in, catching up
//! on messages), then the card waits for a pause in typing and shows. Past
//! [`LATEST`] a morning reading reads stale, so that day is skipped.
//!
//! Deliberately pure, like [`crate::focus`]: the shell measures idle time and
//! calls [`step`] every few seconds; a test can walk a whole morning through
//! it in milliseconds.

use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use serde::{Deserialize, Serialize};

use crate::focus::{ACTIVE_WINDOW_SECONDS, Language, MAX_TICK_GAP_SECONDS, TYPING_PAUSE_SECONDS};

/// Minutes of use, after [`EARLIEST`], before the reading is offered. Only
/// time at the keyboard or mouse counts, so sitting down and then going to
/// make chiya does not run the clock down.
pub const SETTLE_MINUTES: u32 = 5;
/// Use before this does not count: someone up at 3:00 is not having their
/// morning.
pub const EARLIEST: NaiveTime = NaiveTime::from_hms_opt(5, 0, 0).expect("valid time");
/// Nothing after this: a morning reading at 15:00 is yesterday's news.
pub const LATEST: NaiveTime = NaiveTime::from_hms_opt(12, 0, 0).expect("valid time");
/// Once due, how long it waits for a pause in typing before showing anyway.
const DUE_GRACE_SECONDS: i64 = 60;

/// What the reminder remembers between ticks, persisted so a restart neither
/// forgets the minutes already used nor shows the reading twice.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MorningState {
    /// The day `used_seconds` belongs to.
    pub day: Option<NaiveDate>,
    /// Seconds at the computer today since [`EARLIEST`].
    pub used_seconds: u32,
    /// The last day the reading was shown, or read in the app. Once a day.
    pub done: Option<NaiveDate>,
    pub last_tick: Option<DateTime<Utc>>,
    /// When it came due while the user was typing.
    pub due_since: Option<DateTime<Utc>>,
}

/// One measurement from the shell.
#[derive(Debug, Clone, Copy)]
pub struct Tick {
    pub now: DateTime<Utc>,
    /// The computer's own clock: the morning is the user's morning.
    pub local: NaiveDateTime,
    /// Seconds since the last keyboard or mouse input; `None` where the
    /// platform cannot tell, in which case all time counts as use.
    pub idle_seconds: Option<u32>,
    /// A call, a fullscreen app or Do Not Disturb that the user lets hold
    /// reminders back.
    pub held: bool,
    /// Today's reading is in the cache.
    pub reading_ready: bool,
}

/// What the shell should do after a tick.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    Wait,
    /// Due, but today's reading has not been fetched: fetch it, and it shows
    /// on a later tick.
    NeedReading,
    Show,
}

/// Advances the reminder by one measurement.
pub fn step(state: &mut MorningState, tick: Tick) -> Step {
    let date = tick.local.date();
    let time = tick.local.time();
    if state.day != Some(date) {
        state.day = Some(date);
        state.used_seconds = 0;
        state.due_since = None;
    }

    let elapsed = state.last_tick.map_or(0, |last| {
        u32::try_from((tick.now - last).num_seconds().max(0)).unwrap_or(u32::MAX)
    });
    state.last_tick = Some(tick.now);
    // Asleep, shut, or not running: the gap was time away.
    let active = if elapsed > MAX_TICK_GAP_SECONDS {
        0
    } else {
        match tick.idle_seconds {
            Some(idle) if idle > ACTIVE_WINDOW_SECONDS => {
                elapsed.saturating_sub(idle - ACTIVE_WINDOW_SECONDS)
            }
            _ => elapsed,
        }
    };
    if time >= EARLIEST {
        state.used_seconds = state.used_seconds.saturating_add(active);
    }

    if state.done == Some(date)
        || time < EARLIEST
        || time >= LATEST
        || state.used_seconds < SETTLE_MINUTES * 60
        || tick.held
    {
        state.due_since = None;
        return Step::Wait;
    }
    if !tick.reading_ready {
        return Step::NeedReading;
    }

    // Mid-sentence, it waits for the next pause in typing, up to a minute.
    let typing = tick
        .idle_seconds
        .is_some_and(|idle| idle < TYPING_PAUSE_SECONDS);
    let since = *state.due_since.get_or_insert(tick.now);
    if typing && tick.now - since < Duration::seconds(DUE_GRACE_SECONDS) {
        return Step::Wait;
    }
    state.due_since = None;
    state.done = Some(date);
    Step::Show
}

/// The user read today's reading in the app: no reminder today.
pub fn mark_read(state: &mut MorningState, local: NaiveDateTime) {
    state.done = Some(local.date());
    state.due_since = None;
}

/// The reminder's title: "Today's rashifal · Mesh". `sign_en` and `sign_ne`
/// are the sign's names in each language.
pub fn title(sign_en: &str, sign_ne: &str, language: Language) -> String {
    match language {
        Language::En => format!("Today's rashifal · {sign_en}"),
        Language::Ne => format!("आजको राशिफल · {sign_ne}"),
    }
}

/// A stable id per day, so the reminder card queue can tell one day's
/// reading from the next.
pub fn reminder_id(date: NaiveDate) -> String {
    format!("sajilo.rashifal.{date}")
}
