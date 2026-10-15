//! The daily rashifal reminder: today's reading for the user's own sign, at
//! the time they picked.
//!
//! A desktop app cannot always be seen at a fixed hour: at 7:00 the laptop may
//! be shut. So the reading comes at its time if someone is at the computer,
//! and otherwise at the first moment they are back, up to [`LATE_HOURS`]
//! later; past that the day's reading reads stale, and the day is skipped. It
//! waits for a pause in typing so it never lands on a keystroke.
//!
//! Deliberately pure, like [`crate::focus`]: the shell measures idle time and
//! calls [`step`] every few seconds; a test can walk a whole day through it in
//! milliseconds.

use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use serde::{Deserialize, Serialize};

use crate::focus::{ACTIVE_WINDOW_SECONDS, Language, TYPING_PAUSE_SECONDS};
use crate::planner::PlanTime;

/// Once due, how long it waits for a pause in typing before showing anyway.
const DUE_GRACE_SECONDS: i64 = 60;
/// The earliest and latest times the reading can be set for.
pub const EARLIEST: NaiveTime = NaiveTime::from_hms_opt(5, 0, 0).expect("valid time");
pub const LATEST: NaiveTime = NaiveTime::from_hms_opt(22, 0, 0).expect("valid time");
/// When it comes unless the reader picks a time.
pub const DEFAULT_TIME: NaiveTime = NaiveTime::from_hms_opt(7, 0, 0).expect("valid time");
/// A time missed with the computer asleep still comes, this much later at
/// most: 7:00 can arrive at 10:30, but not in the evening.
pub const LATE_HOURS: i64 = 6;

/// The reading's time from the saved option: [`DEFAULT_TIME`] when none is
/// set, or when a hand-edited value falls outside [`EARLIEST`]..=[`LATEST`].
pub fn reading_time(saved: Option<PlanTime>) -> NaiveTime {
    saved
        .and_then(|time| NaiveTime::from_hms_opt(time.hour, time.minute, 0))
        .filter(|time| (EARLIEST..=LATEST).contains(time))
        .unwrap_or(DEFAULT_TIME)
}

/// What the reminder remembers between ticks, persisted so a restart never
/// shows the reading twice.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MorningState {
    /// The last day the reading was shown, or read in the app. Once a day.
    pub done: Option<NaiveDate>,
    /// When it came due while the user was typing.
    pub due_since: Option<DateTime<Utc>>,
}

/// One measurement from the shell.
#[derive(Debug, Clone, Copy)]
pub struct Tick {
    pub now: DateTime<Utc>,
    /// The computer's own clock: the reader's day is the reader's own.
    pub local: NaiveDateTime,
    /// Seconds since the last keyboard or mouse input; `None` where the
    /// platform cannot tell, in which case the user counts as present.
    pub idle_seconds: Option<u32>,
    /// A call, a fullscreen app or Do Not Disturb that the user lets hold
    /// reminders back.
    pub held: bool,
    /// Today's reading is in the cache.
    pub reading_ready: bool,
    /// When the reading is set for. See [`reading_time`].
    pub at: NaiveTime,
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
    // Never past midnight: a late evening time has the rest of its day, not
    // the small hours of the next.
    let late = tick
        .at
        .overflowing_add_signed(Duration::hours(LATE_HOURS))
        .0
        .max(tick.at);
    let in_window = time >= tick.at && (late == tick.at || time < late);
    let present = tick
        .idle_seconds
        .is_none_or(|idle| idle <= ACTIVE_WINDOW_SECONDS);

    if state.done == Some(date) || !in_window || !present || tick.held {
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
