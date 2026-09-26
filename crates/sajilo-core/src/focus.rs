//! Focus: break reminders and screen time for long days at the computer.
//!
//! Deliberately pure. The shell measures how long the keyboard and mouse have
//! been idle and calls [`tick`] every few seconds; every rule that decides
//! whether that time counts, when a break is due and whether it was taken
//! lives here, where a test can walk through a whole workday in milliseconds.
//!
//! Two ideas carry the design:
//!
//! - **Only time at the computer counts.** A reminder to look away after 20
//!   minutes means 20 minutes of use, not 20 minutes since launch. Stepping
//!   away for five minutes is itself a break, so the timers start over.
//! - **Never nag at the wrong moment.** The calendar is a poor guide to that;
//!   what the computer is doing is a good one. A break that comes due during
//!   a call, in a fullscreen app or with Do Not Disturb on is held until the
//!   moment passes, and one due while the user is typing waits for a pause.
//!   Days off are lighter rather than silent: eyes strain on a Saturday too.

use std::collections::BTreeMap;

use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use serde::{Deserialize, Serialize};

use crate::calendar::bikram_sambat::nepali_date_from;
use crate::calendar::events;
use crate::planner::PlanTime;

pub mod jokes;

/// Input within this long counts as being at the computer: reading a page
/// without touching the mouse is still screen time.
pub const ACTIVE_WINDOW_SECONDS: u32 = 60;
/// Away this long is a break in itself, so the eye and movement timers start
/// over. Water is not reset: stepping away is not drinking.
pub const AWAY_RESET_SECONDS: u32 = 5 * 60;
/// Away this long ends a stretch at the computer, for the week's "longest
/// stretch without a break": the length of a stand-up break.
pub const STRETCH_BREAK_SECONDS: u32 = 2 * 60;
/// Ticks further apart than this mean the computer slept or Sajilo was not
/// running. That time is not screen time.
pub const MAX_TICK_GAP_SECONDS: u32 = 3 * 60;
/// How many past days the week view keeps, besides today.
pub const HISTORY_DAYS: usize = 6;
/// What one tap on + logs. Water is counted in litres, and a quarter litre is
/// the smallest amount anyone bothers to log.
pub const WATER_STEP_ML: u32 = 250;
/// The daily goal is typed in litres, kept within what a person might sanely
/// drink and rounded to 50 ml.
pub const WATER_GOAL_MIN_ML: u32 = 500;
pub const WATER_GOAL_MAX_ML: u32 = 8000;
const DEFAULT_WATER_GOAL_ML: u32 = 2500;
/// "In 5 min" on a break card: the reminder comes back after this much more
/// use.
pub const SNOOZE_MINUTES: u32 = 5;
/// A card left alone this long past its countdown was ignored; it goes away
/// on its own rather than sitting on screen all afternoon.
const CARD_TIMEOUT_SECONDS: i64 = 120;
/// Input this recent means the user is mid-sentence: a break that has come
/// due waits for the next pause rather than landing on a keystroke.
pub const TYPING_PAUSE_SECONDS: u32 = 3;
/// How long a due break waits for that pause before it shows anyway.
const DUE_GRACE_SECONDS: i64 = 60;
/// A break that comes due right after a held stretch this long says so: "that
/// was a 45-minute call". Shorter holds are not worth a mention.
pub const HOLD_NOTE_MINUTES: u32 = 10;
/// How soon after a hold ends its note still applies to the next card.
const HOLD_NOTE_WINDOW_MINUTES: i64 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BreakKind {
    /// The 20-20-20 rule: every 20 minutes, look about 6 m (20 ft) away for
    /// 20 seconds.
    Eyes,
    /// Stand up and walk for a couple of minutes.
    Move,
    Water,
    /// The user's own reminder, with their own words and interval.
    Custom,
    /// Once, when work hours end: time to stop. Not on an interval.
    EndOfDay,
    /// Meals and bedtime: once a day at the user's own time.
    Breakfast,
    Lunch,
    Dinner,
    Bedtime,
}

/// How many kinds repeat on an interval, and so keep a timer.
const TIMED: usize = 4;

impl BreakKind {
    /// Every kind that repeats on an interval, in the order they are shown.
    pub const ALL: [Self; TIMED] = [Self::Eyes, Self::Move, Self::Water, Self::Custom];

    /// This kind's slot in the per-kind timers; `None` for the end-of-day
    /// nudge, which keeps no timer.
    fn slot(self) -> Option<usize> {
        match self {
            Self::Eyes => Some(0),
            Self::Move => Some(1),
            Self::Water => Some(2),
            Self::Custom => Some(3),
            Self::EndOfDay | Self::Breakfast | Self::Lunch | Self::Dinner | Self::Bedtime => None,
        }
    }

    /// How long a reminder waits to see its break taken before counting it
    /// as skipped.
    fn answer_window(self) -> Duration {
        match self {
            Self::Eyes => Duration::minutes(3),
            _ => Duration::minutes(15),
        }
    }

    /// How long a break may be set to last, in seconds: a look away of ten
    /// seconds to two minutes, a walk of one to fifteen minutes. The others
    /// have no countdown; they wait for a button.
    pub fn length_range(self) -> (u32, u32) {
        match self {
            Self::Eyes => (10, 2 * 60),
            Self::Move => (60, 15 * 60),
            _ => (0, 0),
        }
    }

    /// The interval, in minutes, the editor accepts: typed freely, from five
    /// minutes to eight hours. Timers count only time at the computer and
    /// restart each morning, so anything longer could never come due. The
    /// stop-work nudge has no interval.
    pub fn interval_range(self) -> (u32, u32) {
        if self.slot().is_some() {
            (5, 480)
        } else {
            (0, 0)
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BreakRule {
    pub enabled: bool,
    pub every_minutes: u32,
}

impl BreakRule {
    const fn off(every_minutes: u32) -> Self {
        Self {
            enabled: false,
            every_minutes,
        }
    }

    fn every_seconds(self) -> u32 {
        self.every_minutes.max(1) * 60
    }
}

/// Every reminder starts off: a desktop app that begins interrupting people
/// the day it is updated would be switched off, not thanked. The Focus screen
/// offers to turn them on in one tap.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FocusSettings {
    pub eyes: BreakRule,
    #[serde(rename = "move")]
    pub move_break: BreakRule,
    pub water: BreakRule,
    /// How long the eye break's countdown runs: 20 seconds is the 20-20-20
    /// rule.
    pub eyes_seconds: u32,
    /// How long the stand-up break's countdown runs.
    pub move_seconds: u32,
    /// Millilitres a day. Water reminders stop once it is reached.
    pub water_goal_ml: u32,
    /// When the stop-work nudge comes. Read from the old "work hours end"
    /// setting, which it replaces: work hours no longer gate breaks.
    #[serde(alias = "workEnd")]
    pub stop_work_at: PlanTime,
    /// Sunday first. The days not ticked, and public holidays, are days off.
    /// Saturday is the one day off everyone shares.
    pub work_days: [bool; 7],
    /// How breaks behave on a day off.
    pub days_off: DaysOff,
    /// The moments a due break waits out.
    pub hold: HoldRules,
    pub style: ReminderStyle,
    /// A soft sound with each reminder, whichever style it takes.
    pub chime: bool,
    /// A rotating joke on the card instead of the plain instruction. Off for
    /// offices where a card about kidneys would not go down well.
    pub jokes: bool,
    /// The user's own reminder.
    pub custom: CustomBreak,
    /// One card at [`Self::stop_work_at`] on a work day, if still at the
    /// computer.
    pub end_of_day: bool,
    /// Meals and bedtime, each at the user's own time.
    pub routine: Routine,
    /// Whether "when do you eat and sleep?" has been asked: once, right after
    /// reminders are first turned on.
    pub routine_asked: bool,
}

/// A reminder at a time of day rather than on an interval.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimedRule {
    pub enabled: bool,
    pub at: PlanTime,
}

impl TimedRule {
    const fn off(hour: u32, minute: u32) -> Self {
        Self {
            enabled: false,
            at: PlanTime { hour, minute },
        }
    }
}

/// When the user eats and sleeps. Every one starts off and is asked about
/// once; the defaults are only a starting point for that question.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Routine {
    pub breakfast: TimedRule,
    pub lunch: TimedRule,
    pub dinner: TimedRule,
    pub bedtime: TimedRule,
}

impl Default for Routine {
    fn default() -> Self {
        Self {
            breakfast: TimedRule::off(8, 0),
            lunch: TimedRule::off(13, 0),
            dinner: TimedRule::off(19, 30),
            bedtime: TimedRule::off(23, 0),
        }
    }
}

impl Routine {
    /// The four, with the kind each one shows as.
    fn each(&self) -> [(BreakKind, TimedRule); 4] {
        [
            (BreakKind::Breakfast, self.breakfast),
            (BreakKind::Lunch, self.lunch),
            (BreakKind::Dinner, self.dinner),
            (BreakKind::Bedtime, self.bedtime),
        ]
    }

    fn any_enabled(&self) -> bool {
        self.each().iter().any(|(_, rule)| rule.enabled)
    }
}

/// A meal or bedtime card still goes out this long after its time, for
/// someone who sat down a little late; after that the moment has passed.
const ROUTINE_WINDOW: i64 = 60;

/// A reminder the user writes: "Stretch your wrists", every two hours.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CustomBreak {
    pub enabled: bool,
    pub every_minutes: u32,
    pub label: String,
}

impl Default for CustomBreak {
    fn default() -> Self {
        Self {
            enabled: false,
            every_minutes: 120,
            label: String::new(),
        }
    }
}

/// Longest custom label kept; the card has one line for a title.
const CUSTOM_LABEL_MAX: usize = 60;

/// What a day off does to breaks. Screen time on a Saturday strains the eyes
/// as much as on a Monday, so the default keeps the look-away and drops only
/// what belongs to a working day.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DaysOff {
    /// Eyes, water and the user's own reminder; no stand-up, no stop-work.
    #[default]
    Lighter,
    /// Every break, as on a work day. The stop-work nudge still rests.
    Normal,
    /// No interval breaks at all. Meals and bedtime keep their times.
    Off,
}

/// Which moments hold a due break until they pass. Each can be switched off
/// for someone whose microphone is always open, say.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HoldRules {
    pub calls: bool,
    pub fullscreen: bool,
    pub do_not_disturb: bool,
}

impl Default for HoldRules {
    fn default() -> Self {
        Self {
            calls: true,
            fullscreen: true,
            do_not_disturb: true,
        }
    }
}

/// Why a due break is being held.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HoldReason {
    Call,
    Fullscreen,
    DoNotDisturb,
}

/// Why today is a day off.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DayOffKind {
    /// A weekday not ticked as a work day: Saturday, for most.
    Weekly,
    PublicHoliday,
}

/// What the platform can see right now. The shell measures it; which of it
/// holds a break is the user's setting, decided here.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Moment {
    /// A microphone or camera is in use.
    pub call: bool,
    /// The frontmost app covers a whole display.
    pub fullscreen: bool,
    pub do_not_disturb: bool,
}

/// Which of those this platform can tell at all, so Settings does not offer
/// a switch that could never do anything.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HoldSupport {
    pub calls: bool,
    pub fullscreen: bool,
    pub do_not_disturb: bool,
}

impl Default for HoldSupport {
    fn default() -> Self {
        Self {
            calls: true,
            fullscreen: true,
            do_not_disturb: true,
        }
    }
}

/// How a due break is announced. A corner notification is easy to miss, so
/// the default is a small card that stays until it is dealt with.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReminderStyle {
    #[default]
    Card,
    Notification,
}

impl Default for FocusSettings {
    fn default() -> Self {
        Self {
            eyes: BreakRule::off(20),
            move_break: BreakRule::off(60),
            water: BreakRule::off(60),
            eyes_seconds: 20,
            move_seconds: 2 * 60,
            water_goal_ml: DEFAULT_WATER_GOAL_ML,
            stop_work_at: PlanTime {
                hour: 18,
                minute: 0,
            },
            work_days: [true, true, true, true, true, true, false],
            days_off: DaysOff::default(),
            hold: HoldRules::default(),
            style: ReminderStyle::Card,
            chime: true,
            jokes: true,
            custom: CustomBreak::default(),
            end_of_day: true,
            routine: Routine::default(),
            routine_asked: false,
        }
    }
}

impl FocusSettings {
    /// The interval rule for `kind`. A custom reminder with no words is off:
    /// a card that says nothing is not a reminder.
    pub fn rule(&self, kind: BreakKind) -> BreakRule {
        match kind {
            BreakKind::Eyes => self.eyes,
            BreakKind::Move => self.move_break,
            BreakKind::Water => self.water,
            BreakKind::Custom => BreakRule {
                enabled: self.custom.enabled && !self.custom.label.trim().is_empty(),
                every_minutes: self.custom.every_minutes,
            },
            _ => BreakRule::off(0),
        }
    }

    /// How long the card for `kind` counts down; zero for none.
    pub fn break_seconds(&self, kind: BreakKind) -> u32 {
        match kind {
            BreakKind::Eyes => self.eyes_seconds,
            BreakKind::Move => self.move_seconds,
            _ => 0,
        }
    }

    pub fn any_enabled(&self) -> bool {
        BreakKind::ALL.iter().any(|kind| self.rule(*kind).enabled) || self.routine.any_enabled()
    }

    /// The recommended set, switched on from the Focus screen's first card.
    #[must_use]
    pub fn with_recommended_breaks(mut self) -> Self {
        self.eyes.enabled = true;
        self.move_break.enabled = true;
        self.water.enabled = true;
        self
    }

    /// Every reminder off, the user's own included, for "Turn off break
    /// reminders". Intervals, the water goal and work days are kept, so
    /// turning them back on picks up where they were.
    #[must_use]
    pub fn with_breaks_off(mut self) -> Self {
        self.eyes.enabled = false;
        self.move_break.enabled = false;
        self.water.enabled = false;
        self.custom.enabled = false;
        self.routine.breakfast.enabled = false;
        self.routine.lunch.enabled = false;
        self.routine.dinner.enabled = false;
        self.routine.bedtime.enabled = false;
        self
    }

    /// Keeps values from an older or hand-edited store within what the editor
    /// can show.
    #[must_use]
    pub fn normalised(mut self) -> Self {
        for kind in BreakKind::ALL {
            let every = match kind {
                BreakKind::Eyes => &mut self.eyes.every_minutes,
                BreakKind::Move => &mut self.move_break.every_minutes,
                BreakKind::Water => &mut self.water.every_minutes,
                BreakKind::Custom => &mut self.custom.every_minutes,
                _ => continue,
            };
            let (min, max) = kind.interval_range();
            *every = (*every).clamp(min, max);
        }
        for kind in [BreakKind::Eyes, BreakKind::Move] {
            let (min, max) = kind.length_range();
            let seconds = match kind {
                BreakKind::Eyes => &mut self.eyes_seconds,
                _ => &mut self.move_seconds,
            };
            *seconds = (*seconds).clamp(min, max);
        }
        self.custom.label = self
            .custom
            .label
            .trim()
            .chars()
            .take(CUSTOM_LABEL_MAX)
            .collect();
        let rounded = (self.water_goal_ml + 25) / 50 * 50;
        self.water_goal_ml = rounded.clamp(WATER_GOAL_MIN_ML, WATER_GOAL_MAX_ML);
        for rule in [
            &mut self.routine.breakfast,
            &mut self.routine.lunch,
            &mut self.routine.dinner,
            &mut self.routine.bedtime,
        ] {
            rule.at = clamp_time(rule.at);
        }
        self.stop_work_at = clamp_time(self.stop_work_at);
        self
    }

    fn is_work_day(&self, date: NaiveDate) -> bool {
        self.work_days[date.weekday().num_days_from_sunday() as usize]
    }

    /// Whether `kind`'s interval runs today. Every kind runs on a work day;
    /// a day off drops what [`DaysOff`] says it drops.
    fn runs_today(&self, kind: BreakKind, day_off: bool) -> bool {
        !day_off
            || match self.days_off {
                DaysOff::Normal => true,
                DaysOff::Lighter => kind != BreakKind::Move,
                DaysOff::Off => false,
            }
    }

    /// Which of `moment`'s signals the user lets hold a break, the most
    /// telling first: a call is the worst moment to be interrupted.
    fn hold_reason(&self, moment: Moment) -> Option<HoldReason> {
        if self.hold.calls && moment.call {
            Some(HoldReason::Call)
        } else if self.hold.fullscreen && moment.fullscreen {
            Some(HoldReason::Fullscreen)
        } else if self.hold.do_not_disturb && moment.do_not_disturb {
            Some(HoldReason::DoNotDisturb)
        } else {
            None
        }
    }

    /// Whether `time` is in the three hours after the stop-work time, when a
    /// nudge to stop still means something.
    fn just_after_work(&self, time: NaiveTime) -> bool {
        let since_end = time.signed_duration_since(as_time(self.stop_work_at));
        let since_end = if since_end < Duration::zero() {
            since_end + Duration::days(1)
        } else {
            since_end
        };
        since_end < Duration::hours(3)
    }
}

fn clamp_time(time: PlanTime) -> PlanTime {
    PlanTime {
        hour: time.hour.min(23),
        minute: time.minute.min(59),
    }
}

fn as_time(time: PlanTime) -> NaiveTime {
    NaiveTime::from_hms_opt(time.hour.min(23), time.minute.min(59), 0).unwrap_or(NaiveTime::MIN)
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BreakCount {
    /// Reminders sent.
    pub reminded: u32,
    /// Of those, breaks actually taken: the computer went quiet soon after.
    pub taken: u32,
}

/// One day of use, by the computer's own calendar day.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusDay {
    pub date: NaiveDate,
    pub screen_seconds: u32,
    #[serde(default)]
    pub water_ml: u32,
    pub eyes: BreakCount,
    #[serde(rename = "move")]
    pub move_break: BreakCount,
    /// The longest time at the computer without stepping away for
    /// [`STRETCH_BREAK_SECONDS`].
    #[serde(default)]
    pub longest_stretch_seconds: u32,
}

impl FocusDay {
    fn new(date: NaiveDate) -> Self {
        Self {
            date,
            screen_seconds: 0,
            water_ml: 0,
            eyes: BreakCount::default(),
            move_break: BreakCount::default(),
            longest_stretch_seconds: 0,
        }
    }

    fn count_mut(&mut self, kind: BreakKind) -> Option<&mut BreakCount> {
        match kind {
            BreakKind::Eyes => Some(&mut self.eyes),
            BreakKind::Move => Some(&mut self.move_break),
            _ => None,
        }
    }
}

/// What the tracker remembers between ticks, persisted so a restart keeps
/// today's numbers and does not reset a timer that was nearly due.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FocusState {
    pub today: Option<FocusDay>,
    /// Most recent first, at most [`HISTORY_DAYS`].
    pub history: Vec<FocusDay>,
    pub last_tick: Option<DateTime<Utc>>,
    /// Seconds at the computer since each kind's last break, by
    /// [`BreakKind::slot`]. Padded when read, so a store written before a
    /// kind existed still loads.
    #[serde(deserialize_with = "padded")]
    pub since_break: [u32; TIMED],
    /// When each kind's latest reminder went out, while it waits to see the
    /// break taken.
    #[serde(deserialize_with = "padded")]
    pub awaiting: [Option<DateTime<Utc>>; TIMED],
    /// The day the end-of-work nudge went out, so it goes out once.
    pub end_of_day_sent: Option<NaiveDate>,
    /// Put off with "Remind in 5 min": not again before this.
    pub end_of_day_after: Option<DateTime<Utc>>,
    /// The day each meal or bedtime card last went out, and when a put-off
    /// one may come back.
    pub routine: [RoutineSent; 4],
    pub paused_until: Option<DateTime<Utc>>,
    /// Idle seconds at the latest tick; `None` where the platform cannot say.
    pub last_idle: Option<u32>,
    /// The break card on screen, if any.
    pub active_break: Option<ActiveBreak>,
    /// Seconds at the computer since the user last stepped away.
    pub stretch_seconds: u32,
    /// How far each joke deck has been dealt, by [`jokes::deck_name`], so
    /// a line does not come round again until the rest have.
    pub jokes_told: BTreeMap<String, u32>,
    /// Each kind's current reminder has been put off once already; the next
    /// card for it offers no "later".
    #[serde(deserialize_with = "padded")]
    pub snoozed: [bool; TIMED],
    /// The moment holding breaks back now, and since when.
    pub held: Option<Held>,
    /// A hold that just ended, for the next card to mention.
    pub after_hold: Option<AfterHold>,
    /// When a break came due while the user was typing; it waits for a
    /// pause, but not forever.
    pub due_since: Option<DateTime<Utc>>,
    /// The public-holiday answer for one day, so the bundled calendar is not
    /// consulted every few seconds.
    #[serde(skip)]
    holiday: Option<(NaiveDate, bool)>,
}

impl FocusState {
    fn day_mut(&mut self, date: NaiveDate) -> &mut FocusDay {
        if self.today.as_ref().is_some_and(|day| day.date != date) {
            let finished = self.today.take().expect("checked above");
            self.history.insert(0, finished);
            self.history.truncate(HISTORY_DAYS);
            // A new day starts fresh; yesterday's half-finished timers do not
            // carry over into the morning.
            self.since_break = [0; TIMED];
            self.awaiting = [None; TIMED];
            self.snoozed = [false; TIMED];
            self.stretch_seconds = 0;
            self.due_since = None;
            self.end_of_day_after = None;
            for sent in &mut self.routine {
                sent.after = None;
            }
        }
        self.today.get_or_insert_with(|| FocusDay::new(date))
    }

    fn is_public_holiday(&mut self, date: NaiveDate) -> bool {
        if let Some((cached, answer)) = self.holiday
            && cached == date
        {
            return answer;
        }
        let answer = public_holiday(date);
        self.holiday = Some((date, answer));
        answer
    }
}

/// A moment holding breaks back.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Held {
    pub reason: HoldReason,
    pub since: DateTime<Utc>,
}

/// A hold that has ended: what it was and how long it lasted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AfterHold {
    pub reason: HoldReason,
    pub minutes: u32,
    /// The note is for the break the hold kept back, not one an hour later.
    pub until: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RoutineSent {
    pub on: Option<NaiveDate>,
    pub after: Option<DateTime<Utc>>,
}

fn routine_slot(kind: BreakKind) -> Option<usize> {
    match kind {
        BreakKind::Breakfast => Some(0),
        BreakKind::Lunch => Some(1),
        BreakKind::Dinner => Some(2),
        BreakKind::Bedtime => Some(3),
        _ => None,
    }
}

/// Reads a per-kind array however long it was stored, filling kinds added
/// since with their defaults.
fn padded<'de, D, T>(deserializer: D) -> Result<[T; TIMED], D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de> + Default + Copy,
{
    let stored = Vec::<T>::deserialize(deserializer)?;
    let mut out = [T::default(); TIMED];
    for (slot, value) in out.iter_mut().zip(stored) {
        *slot = value;
    }
    Ok(out)
}

fn public_holiday(date: NaiveDate) -> bool {
    nepali_date_from(date).is_ok_and(|bs| {
        events::events(bs.year, bs.month)
            .get(&bs.day)
            .is_some_and(|event| event.is_public_holiday)
    })
}

/// The language a notification is written in; the card window picks its own
/// from the app's setting.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    #[default]
    En,
    Ne,
}

/// A break card showing now.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveBreak {
    pub kind: BreakKind,
    pub started_at: DateTime<Utc>,
    /// Length of its countdown; 0 for water, which waits for a button.
    pub seconds: u32,
    /// Opened from "Show me an example": closing it counts for nothing.
    #[serde(default)]
    pub preview: bool,
    /// Said in place of the plain instruction, when jokes are on.
    #[serde(default)]
    pub joke: Option<jokes::Joke>,
    /// Said once the break is taken, when jokes are on.
    #[serde(default)]
    pub cheer: Option<jokes::Joke>,
    /// Whether "later" is on offer: once per reminder, and never for a look
    /// away, which takes less time than deciding to put it off.
    #[serde(default)]
    pub can_snooze: bool,
    /// The call (or film, or quiet hour) this break waited out, when it was
    /// long enough to mention.
    #[serde(default)]
    pub after_hold: Option<AfterHold>,
}

impl ActiveBreak {
    /// A card for `kind`, its lines dealt now so they stay put while it is
    /// on screen.
    fn new(
        state: &mut FocusState,
        settings: &FocusSettings,
        kind: BreakKind,
        started_at: DateTime<Utc>,
        preview: bool,
    ) -> Self {
        // An example shows the next lines without dealing them, so trying
        // the card out moves nothing on.
        let mut scratch;
        let told = if preview {
            scratch = state.jokes_told.clone();
            &mut scratch
        } else {
            &mut state.jokes_told
        };
        let (joke, cheer) = if settings.jokes {
            (
                deal_joke(told, kind),
                jokes::deal(told, jokes::DONE_DECK, jokes::DONE),
            )
        } else {
            (None, None)
        };
        let can_snooze = match (kind, kind.slot(), routine_slot(kind)) {
            (BreakKind::Eyes, ..) => false,
            _ if preview => true,
            (_, Some(slot), _) => !state.snoozed[slot],
            (_, None, Some(slot)) => state.routine[slot].after.is_none(),
            (_, None, None) => state.end_of_day_after.is_none(),
        };
        Self {
            kind,
            started_at,
            seconds: settings.break_seconds(kind),
            preview,
            joke,
            cheer,
            can_snooze,
            after_hold: None,
        }
    }
}

fn deal_joke(told: &mut BTreeMap<String, u32>, kind: BreakKind) -> Option<jokes::Joke> {
    jokes::deal(told, jokes::deck_name(kind), jokes::lines(kind))
}

/// How a break card was closed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BreakOutcome {
    /// The countdown ran out: the break was taken.
    Done,
    Skip,
    /// Ask again after [`SNOOZE_MINUTES`] more of use.
    Snooze,
    /// Water logged from the card.
    Drank,
}

/// One measurement from the shell.
#[derive(Debug, Clone, Copy)]
pub struct Tick {
    pub now: DateTime<Utc>,
    /// The computer's own local time: work hours and the day boundary follow
    /// the user's clock, wherever they are.
    pub local: NaiveDateTime,
    /// Seconds since the last keyboard or mouse input; `None` where the
    /// platform cannot tell, in which case all time counts as active.
    pub idle_seconds: Option<u32>,
    /// Calls, fullscreen apps and Do Not Disturb, as the platform sees them.
    pub moment: Moment,
    /// Some app is keeping the display awake on an unlocked screen: a video,
    /// a call, a slideshow. Hands off the keyboard, eyes on the screen.
    pub display_held: bool,
}

/// Why reminders are or are not counting down right now.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FocusStatus {
    /// Every reminder is switched off.
    Off,
    Paused,
    /// A call, a fullscreen app or Do Not Disturb: breaks still come due,
    /// and wait.
    Held,
    /// A day off with interval breaks set to rest.
    DayOff,
    Away,
    Active,
}

impl FocusState {
    /// Why today is a day off, if it is.
    fn day_off(&mut self, settings: &FocusSettings, date: NaiveDate) -> Option<DayOffKind> {
        if self.is_public_holiday(date) {
            Some(DayOffKind::PublicHoliday)
        } else if !settings.is_work_day(date) {
            Some(DayOffKind::Weekly)
        } else {
            None
        }
    }
}

fn quiet_reason(
    state: &mut FocusState,
    settings: &FocusSettings,
    now: DateTime<Utc>,
    local: NaiveDateTime,
) -> Option<FocusStatus> {
    if !settings.any_enabled() {
        return Some(FocusStatus::Off);
    }
    if state.paused_until.is_some_and(|until| now < until) {
        return Some(FocusStatus::Paused);
    }
    if state.held.is_some() {
        return Some(FocusStatus::Held);
    }
    if settings.days_off == DaysOff::Off && state.day_off(settings, local.date()).is_some() {
        return Some(FocusStatus::DayOff);
    }
    None
}

/// Starts, keeps or ends the hold `reason` asks for. A card already up when
/// a call starts goes away: nobody wants it on a shared screen. Its reminder
/// stays open, so stepping away still counts it taken.
fn track_hold(state: &mut FocusState, reason: Option<HoldReason>, now: DateTime<Utc>) {
    match (state.held, reason) {
        (None, Some(reason)) => {
            state.held = Some(Held { reason, since: now });
            if state
                .active_break
                .as_ref()
                .is_some_and(|card| !card.preview)
            {
                state.active_break = None;
            }
        }
        (Some(held), Some(reason)) => {
            state.held = Some(Held { reason, ..held });
        }
        (Some(held), None) => {
            state.held = None;
            let minutes = u32::try_from((now - held.since).num_minutes().max(0)).unwrap_or(0);
            state.after_hold = (minutes >= HOLD_NOTE_MINUTES).then_some(AfterHold {
                reason: held.reason,
                minutes,
                until: now + Duration::minutes(HOLD_NOTE_WINDOW_MINUTES),
            });
        }
        (None, None) => {}
    }
    if state.after_hold.is_some_and(|after| now > after.until) {
        state.after_hold = None;
    }
}

/// The part of the last `elapsed` seconds spent at the computer. Input within
/// [`ACTIVE_WINDOW_SECONDS`] counts; beyond that, only the stretch before the
/// user went quiet does.
fn active_part(elapsed: u32, idle: u32) -> u32 {
    if idle <= ACTIVE_WINDOW_SECONDS {
        elapsed
    } else {
        elapsed.saturating_sub(idle - ACTIVE_WINDOW_SECONDS)
    }
}

/// Advances the tracker by one measurement and returns the breaks now due, for
/// the shell to announce.
pub fn tick(state: &mut FocusState, settings: &FocusSettings, tick: Tick) -> Vec<BreakKind> {
    let date = tick.local.date();
    state.day_mut(date);
    let elapsed = state.last_tick.map_or(0, |last| {
        u32::try_from((tick.now - last).num_seconds().max(0)).unwrap_or(u32::MAX)
    });
    state.last_tick = Some(tick.now);
    // Watching is being at the computer: a held display reads as fresh
    // input, so the time counts and the eye timer keeps running through a
    // film. So is a call, with nobody touching the keyboard. Where idle
    // cannot be measured at all, it stays unmeasured.
    let input_idle = if tick.display_held || tick.moment.call {
        tick.idle_seconds.map(|_| 0)
    } else {
        tick.idle_seconds
    };
    state.last_idle = input_idle;
    if state.paused_until.is_some_and(|until| tick.now >= until) {
        state.paused_until = None;
    }
    if state.active_break.as_ref().is_some_and(|card| {
        tick.now - card.started_at
            > Duration::seconds(i64::from(card.seconds) + CARD_TIMEOUT_SECONDS)
    }) {
        state.active_break = None;
    }

    // Asleep, shut, or not running: the gap itself was time away.
    let idle = if elapsed > MAX_TICK_GAP_SECONDS {
        elapsed
    } else {
        input_idle.unwrap_or(0)
    };
    let active = if elapsed > MAX_TICK_GAP_SECONDS {
        0
    } else {
        active_part(elapsed, idle)
    };

    let stretch = state.stretch_seconds.saturating_add(active);
    let today = state.day_mut(date);
    today.screen_seconds = today.screen_seconds.saturating_add(active);
    today.longest_stretch_seconds = today.longest_stretch_seconds.max(stretch);
    // Counted up to the moment the user went quiet, then over.
    state.stretch_seconds = if idle >= STRETCH_BREAK_SECONDS {
        0
    } else {
        stretch
    };

    settle_reminders(state, settings, date, idle, tick.now);
    if idle >= AWAY_RESET_SECONDS {
        state.since_break[0] = 0;
        state.since_break[1] = 0;
    }

    track_hold(state, settings.hold_reason(tick.moment), tick.now);
    let held = state.held.is_some();

    if !held {
        if let Some(kind) = routine_due(state, settings, tick, idle) {
            return vec![kind];
        }
        if end_of_day_due(state, settings, tick, idle) {
            state.end_of_day_sent = Some(date);
            open_card(state, settings, BreakKind::EndOfDay, tick.now);
            return vec![BreakKind::EndOfDay];
        }
    }

    // A hold is not quiet: the timers keep counting through a call, so the
    // stand-up it held back comes the moment it ends.
    if quiet_reason(state, settings, tick.now, tick.local)
        .is_some_and(|status| status != FocusStatus::Held)
    {
        state.due_since = None;
        return Vec::new();
    }

    let mut due = count_towards_breaks(state, settings, date, active);
    if held || due.is_empty() {
        state.due_since = None;
        return Vec::new();
    }

    // Mid-sentence, it waits for the next pause in typing, up to a minute.
    let typing = tick
        .idle_seconds
        .is_some_and(|idle| idle < TYPING_PAUSE_SECONDS);
    let waiting_since = *state.due_since.get_or_insert(tick.now);
    if typing && tick.now - waiting_since < Duration::seconds(DUE_GRACE_SECONDS) {
        return Vec::new();
    }
    state.due_since = None;

    mark_reminded(state, date, tick.now, &mut due);

    if let Some(kind) = due.first().copied() {
        open_card(state, settings, kind, tick.now);
        let after_hold = state.after_hold.take();
        if let Some(card) = state.active_break.as_mut()
            && card.started_at == tick.now
        {
            card.after_hold = after_hold;
        }
    }
    due
}

/// Records `due` as reminded now and restarts their timers. Standing up rests
/// the eyes too: when both come due together, the movement break is the one
/// asked for.
fn mark_reminded(
    state: &mut FocusState,
    date: NaiveDate,
    now: DateTime<Utc>,
    due: &mut Vec<BreakKind>,
) {
    for kind in due.iter() {
        let Some(index) = kind.slot() else {
            continue;
        };
        state.since_break[index] = 0;
        state.awaiting[index] = Some(now);
        if let Some(count) = state.day_mut(date).count_mut(*kind) {
            count.reminded += 1;
        }
    }

    if due.contains(&BreakKind::Move) && due.contains(&BreakKind::Eyes) {
        due.retain(|kind| *kind != BreakKind::Eyes);
        state.awaiting[0] = None;
        let today = state.day_mut(date);
        today.eyes.reminded = today.eyes.reminded.saturating_sub(1);
    }
}

/// Adds `active` seconds to every interval that runs today and returns the
/// kinds whose time has come, without announcing them yet. A met water goal
/// restarts its timer instead of coming due.
fn count_towards_breaks(
    state: &mut FocusState,
    settings: &FocusSettings,
    date: NaiveDate,
    active: u32,
) -> Vec<BreakKind> {
    let day_off = state.day_off(settings, date).is_some();
    let mut due = Vec::new();
    for kind in BreakKind::ALL {
        let rule = settings.rule(kind);
        let Some(index) = kind.slot() else {
            continue;
        };
        if !rule.enabled || !settings.runs_today(kind, day_off) {
            continue;
        }
        state.since_break[index] = state.since_break[index].saturating_add(active);
        if state.since_break[index] < rule.every_seconds() || state.awaiting[index].is_some() {
            continue;
        }
        if kind == BreakKind::Water && state.day_mut(date).water_ml >= settings.water_goal_ml {
            state.since_break[index] = 0;
            continue;
        }
        due.push(kind);
    }
    due
}

/// Shows `kind` as the break card, in the card style, unless one is up.
fn open_card(
    state: &mut FocusState,
    settings: &FocusSettings,
    kind: BreakKind,
    now: DateTime<Utc>,
) {
    if settings.style == ReminderStyle::Card && state.active_break.is_none() {
        state.active_break = Some(ActiveBreak::new(state, settings, kind, now, false));
    }
}

/// A card is up, so a once-a-day card waits its turn instead of being
/// marked sent without ever being seen.
fn card_showing(state: &FocusState, settings: &FocusSettings) -> bool {
    settings.style == ReminderStyle::Card && state.active_break.is_some()
}

/// A meal or bedtime whose time has come today: within the hour after it, to
/// someone at the computer, and not yet sent. Work hours do not apply —
/// bedtime is meant to come after work — but a pause does.
fn routine_due(
    state: &mut FocusState,
    settings: &FocusSettings,
    tick: Tick,
    idle: u32,
) -> Option<BreakKind> {
    if idle > ACTIVE_WINDOW_SECONDS
        || state.paused_until.is_some_and(|until| tick.now < until)
        || card_showing(state, settings)
    {
        return None;
    }
    let date = tick.local.date();
    let time = tick.local.time();
    let (kind, _) = settings.routine.each().into_iter().find(|(kind, rule)| {
        let Some(slot) = routine_slot(*kind) else {
            return false;
        };
        let sent = state.routine[slot];
        let since = time.signed_duration_since(as_time(rule.at));
        rule.enabled
            && sent.on != Some(date)
            && sent.after.is_none_or(|after| tick.now >= after)
            && since >= Duration::zero()
            && since < Duration::minutes(ROUTINE_WINDOW)
    })?;
    if let Some(slot) = routine_slot(kind) {
        state.routine[slot].on = Some(date);
    }
    open_card(state, settings, kind, tick.now);
    Some(kind)
}

/// Once a work day, in the hours after the stop-work time, and only to someone
/// still at the computer: a nudge to someone who has already left is noise.
fn end_of_day_due(state: &mut FocusState, settings: &FocusSettings, tick: Tick, idle: u32) -> bool {
    let date = tick.local.date();
    settings.end_of_day
        && !card_showing(state, settings)
        && settings.any_enabled()
        && state.end_of_day_sent != Some(date)
        && state.end_of_day_after.is_none_or(|after| tick.now >= after)
        && state.paused_until.is_none_or(|until| tick.now >= until)
        && idle <= ACTIVE_WINDOW_SECONDS
        && state.day_off(settings, date).is_none()
        && settings.just_after_work(tick.local.time())
}

/// Opens an example card, so someone deciding whether to turn reminders on
/// sees exactly what they would get. It changes no count and no timer.
pub fn preview_break(
    state: &mut FocusState,
    settings: &FocusSettings,
    kind: BreakKind,
    now: DateTime<Utc>,
) {
    state.active_break = Some(ActiveBreak::new(state, settings, kind, now, true));
}

/// Closes the break card the way the user closed it.
pub fn finish_break(
    state: &mut FocusState,
    settings: &FocusSettings,
    outcome: BreakOutcome,
    local: NaiveDateTime,
) {
    let Some(card) = state.active_break.take() else {
        return;
    };
    if card.preview {
        return;
    }
    let date = local.date();
    let Some(index) = card.kind.slot() else {
        // Timed cards keep no timer. Put off, they ask again in five
        // minutes; otherwise they are done for the day.
        if outcome == BreakOutcome::Snooze && card.can_snooze {
            let after = Some(card.started_at + Duration::minutes(i64::from(SNOOZE_MINUTES)));
            if let Some(slot) = routine_slot(card.kind) {
                state.routine[slot] = RoutineSent { on: None, after };
            } else {
                state.end_of_day_sent = None;
                state.end_of_day_after = after;
            }
        }
        return;
    };
    state.snoozed[index] = outcome == BreakOutcome::Snooze && card.can_snooze;
    match outcome {
        BreakOutcome::Snooze if !card.can_snooze => state.awaiting[index] = None,
        BreakOutcome::Done => {
            // Already counted if the computer went quiet during the countdown.
            if state.awaiting[index].take().is_some()
                && let Some(count) = state.day_mut(date).count_mut(card.kind)
            {
                count.taken += 1;
            }
        }
        BreakOutcome::Skip => state.awaiting[index] = None,
        BreakOutcome::Snooze => {
            state.awaiting[index] = None;
            state.since_break[index] = settings
                .rule(card.kind)
                .every_seconds()
                .saturating_sub(SNOOZE_MINUTES * 60);
            // Put off, not missed: the reminder that comes back is this one.
            if let Some(count) = state.day_mut(date).count_mut(card.kind) {
                count.reminded = count.reminded.saturating_sub(1);
            }
        }
        BreakOutcome::Drank => log_water(state, local, 1),
    }
}

/// Resolves reminders waiting for an answer: a quiet computer soon after means
/// the break was taken; silence past the window means it was skipped.
///
/// Idle as long as the break lasts is the signal it was taken. Water has no
/// such signal; it is logged by hand.
fn settle_reminders(
    state: &mut FocusState,
    settings: &FocusSettings,
    date: NaiveDate,
    idle: u32,
    now: DateTime<Utc>,
) {
    for kind in BreakKind::ALL {
        let Some(index) = kind.slot() else {
            continue;
        };
        let Some(sent) = state.awaiting[index] else {
            continue;
        };
        let rest = settings.break_seconds(kind);
        if rest > 0 && idle >= rest {
            if let Some(count) = state.day_mut(date).count_mut(kind) {
                count.taken += 1;
            }
            state.awaiting[index] = None;
            state.snoozed[index] = false;
        } else if now - sent > kind.answer_window() {
            state.awaiting[index] = None;
            state.snoozed[index] = false;
        }
    }
}

/// Logs `steps` of [`WATER_STEP_ML`] today, or with a negative count takes
/// them back.
pub fn log_water(state: &mut FocusState, local: NaiveDateTime, steps: i32) {
    let today = state.day_mut(local.date());
    let change = steps.saturating_mul(WATER_STEP_ML as i32);
    today.water_ml = today.water_ml.saturating_add_signed(change).min(10_000);
    // Drinking answers a pending water reminder, and restarts its timer.
    if steps > 0 {
        state.awaiting[2] = None;
        state.snoozed[2] = false;
        state.since_break[2] = 0;
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PauseChoice {
    HalfHour,
    Hour,
    /// Until the computer's next midnight.
    RestOfDay,
    Resume,
}

pub fn pause(
    state: &mut FocusState,
    choice: PauseChoice,
    now: DateTime<Utc>,
    local: NaiveDateTime,
) {
    state.paused_until = match choice {
        PauseChoice::HalfHour => Some(now + Duration::minutes(30)),
        PauseChoice::Hour => Some(now + Duration::hours(1)),
        PauseChoice::RestOfDay => {
            let midnight = local
                .date()
                .succ_opt()
                .map(|next| next.and_time(NaiveTime::MIN));
            midnight.map(|midnight| now + (midnight - local))
        }
        PauseChoice::Resume => None,
    };
    if choice != PauseChoice::Resume {
        state.active_break = None;
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NextBreak {
    pub kind: BreakKind,
    pub enabled: bool,
    pub every_minutes: u32,
    /// The interval the editor accepts, so the screen never keeps its own.
    pub min_minutes: u32,
    pub max_minutes: u32,
    /// How long its countdown runs, and what the editor accepts, in seconds;
    /// all zero for a break with no countdown.
    pub break_seconds: u32,
    pub min_break_seconds: u32,
    pub max_break_seconds: u32,
    /// Minutes of computer use until it is due; `None` while nothing counts
    /// down, or once today's water goal is met.
    pub minutes_left: Option<u32>,
    /// Switched on, but resting because today is a day off.
    pub rests_today: bool,
}

/// Everything the Focus screen and the home card show.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusSnapshot {
    pub settings: FocusSettings,
    pub status: FocusStatus,
    pub today: FocusDay,
    pub breaks: Vec<NextBreak>,
    pub paused_until: Option<DateTime<Utc>>,
    /// What one tap on + logs, and the goal's limits, in ml.
    pub water_step_ml: u32,
    pub water_goal_min_ml: u32,
    pub water_goal_max_ml: u32,
    /// What "later" on a break card means, in minutes of use.
    pub snooze_minutes: u32,
    /// The break card showing now, for the card window to draw.
    pub active_break: Option<ActiveBreak>,
    /// False where the platform cannot report idle time, so the screen can say
    /// that all time counts.
    pub idle_supported: bool,
    /// The last seven days, oldest first and ending today. Days with no
    /// record (Sajilo not running, or before it was installed) are empty
    /// rather than missing, so a chart always has seven slots.
    pub week: Vec<FocusDay>,
    /// Those seven days, added up for the "This week" card.
    pub summary: WeekSummary,
    /// What is holding breaks back right now, while [`FocusStatus::Held`].
    pub hold: Option<HoldReason>,
    /// Why today is a day off, if it is; what that does is
    /// [`FocusSettings::days_off`].
    pub day_off: Option<DayOffKind>,
    /// A usual day's screen time: the average of the recorded days before
    /// today. `None` until there is one.
    pub usual_screen_seconds: Option<u32>,
    /// Which holds this platform can see. The shell fills it in.
    pub hold_support: HoldSupport,
}

/// One day's bar on the week chart.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekBar {
    pub date: NaiveDate,
    /// Sunday is 0, as the calendar's own weekday labels are ordered.
    pub weekday: u32,
    pub screen_seconds: u32,
    pub today: bool,
    /// Whether this weekday is one of the user's work days. Days off are
    /// drawn apart on the chart and averaged on their own.
    pub work_day: bool,
}

/// The longest stretch at the computer without stepping away, and its day.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stretch {
    pub weekday: u32,
    pub today: bool,
    pub seconds: u32,
}

/// The week in a few numbers. Averages count only days Sajilo saw the
/// computer in use, so a weekend away does not flatter the figure.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekSummary {
    pub days: Vec<WeekBar>,
    /// Days with any screen time.
    pub tracked_days: u32,
    /// Work days with any screen time, and their average. A Saturday spent on
    /// a film would otherwise read as a heavy work week, or hide if dropped.
    pub work_days_tracked: u32,
    pub average_screen_seconds: u32,
    /// Days off with any screen time, and their own average.
    pub off_days_tracked: u32,
    pub off_average_screen_seconds: u32,
    /// Eye and stand-up breaks: reminders sent, and breaks taken.
    pub breaks_reminded: u32,
    pub breaks_taken: u32,
    /// Tracked days the water goal was reached, by today's goal.
    pub water_goal_days: u32,
    /// `None` until a stretch of at least a minute has been measured.
    pub longest_stretch: Option<Stretch>,
}

/// Adds up the week the Focus screen shows. `work_days` is the user's
/// setting, Sunday first: work days and days off are averaged apart.
pub fn summarise(
    week: &[FocusDay],
    goal_ml: u32,
    today: NaiveDate,
    work_days: &[bool; 7],
) -> WeekSummary {
    let is_work_day =
        |day: &FocusDay| work_days[day.date.weekday().num_days_from_sunday() as usize];
    let tracked: Vec<&FocusDay> = week.iter().filter(|day| day.screen_seconds > 0).collect();
    let tracked_days = u32::try_from(tracked.len()).unwrap_or(u32::MAX);
    let (work, off): (Vec<&FocusDay>, Vec<&FocusDay>) =
        tracked.iter().partition(|day| is_work_day(day));
    let average = |days: &[&FocusDay]| -> (u32, u32) {
        let count = u32::try_from(days.len()).unwrap_or(u32::MAX);
        if count == 0 {
            return (0, 0);
        }
        let total: u64 = days.iter().map(|day| u64::from(day.screen_seconds)).sum();
        (
            count,
            u32::try_from(total / u64::from(count)).unwrap_or(u32::MAX),
        )
    };
    let (work_days_tracked, average_screen_seconds) = average(&work);
    let (off_days_tracked, off_average_screen_seconds) = average(&off);
    let longest_stretch = week
        .iter()
        .filter(|day| day.longest_stretch_seconds >= 60)
        // The latest day wins a tie: it is the one the user remembers.
        .max_by_key(|day| (day.longest_stretch_seconds, day.date))
        .map(|day| Stretch {
            weekday: day.date.weekday().num_days_from_sunday(),
            today: day.date == today,
            seconds: day.longest_stretch_seconds,
        });
    WeekSummary {
        days: week
            .iter()
            .map(|day| WeekBar {
                date: day.date,
                weekday: day.date.weekday().num_days_from_sunday(),
                screen_seconds: day.screen_seconds,
                today: day.date == today,
                work_day: is_work_day(day),
            })
            .collect(),
        tracked_days,
        work_days_tracked,
        average_screen_seconds,
        off_days_tracked,
        off_average_screen_seconds,
        breaks_reminded: week
            .iter()
            .map(|day| day.eyes.reminded + day.move_break.reminded)
            .sum(),
        breaks_taken: week
            .iter()
            .map(|day| day.eyes.taken + day.move_break.taken)
            .sum(),
        water_goal_days: u32::try_from(
            tracked.iter().filter(|day| day.water_ml >= goal_ml).count(),
        )
        .unwrap_or(u32::MAX),
        longest_stretch,
    }
}

pub fn snapshot(
    state: &mut FocusState,
    settings: &FocusSettings,
    now: DateTime<Utc>,
    local: NaiveDateTime,
) -> FocusSnapshot {
    let today = state.day_mut(local.date()).clone();
    let away = state
        .last_idle
        .is_some_and(|idle| idle > ACTIVE_WINDOW_SECONDS)
        || state
            .last_tick
            .is_none_or(|last| now - last > Duration::seconds(i64::from(MAX_TICK_GAP_SECONDS)));
    let quiet = quiet_reason(state, settings, now, local);
    let status = quiet.unwrap_or(if away {
        FocusStatus::Away
    } else {
        FocusStatus::Active
    });
    let counting = quiet.is_none();
    let day_off = state.day_off(settings, local.date());
    let breaks = BreakKind::ALL
        .into_iter()
        .map(|kind| {
            let rule = settings.rule(kind);
            let runs = settings.runs_today(kind, day_off.is_some());
            let goal_met = kind == BreakKind::Water && today.water_ml >= settings.water_goal_ml;
            let used = kind.slot().map_or(0, |slot| state.since_break[slot]);
            NextBreak {
                kind,
                enabled: rule.enabled,
                every_minutes: rule.every_minutes,
                min_minutes: kind.interval_range().0,
                max_minutes: kind.interval_range().1,
                break_seconds: settings.break_seconds(kind),
                min_break_seconds: kind.length_range().0,
                max_break_seconds: kind.length_range().1,
                minutes_left: (rule.enabled && counting && runs && !goal_met)
                    .then(|| rule.every_seconds().saturating_sub(used).div_ceil(60)),
                rests_today: rule.enabled && !runs,
            }
        })
        .collect();
    let days = week(&state.history, &today);
    let before: Vec<u32> = state
        .history
        .iter()
        .map(|day| day.screen_seconds)
        .filter(|seconds| *seconds > 0)
        .collect();
    let usual_screen_seconds = u32::try_from(before.len())
        .ok()
        .filter(|count| *count > 0)
        .map(|count| {
            let total: u64 = before.iter().copied().map(u64::from).sum();
            u32::try_from(total / u64::from(count)).unwrap_or(u32::MAX)
        });
    FocusSnapshot {
        hold: state.held.map(|held| held.reason),
        day_off,
        usual_screen_seconds,
        hold_support: HoldSupport::default(),
        settings: settings.clone(),
        status,
        summary: summarise(
            &days,
            settings.water_goal_ml,
            today.date,
            &settings.work_days,
        ),
        week: days,
        today,
        breaks,
        paused_until: state.paused_until.filter(|until| now < *until),
        idle_supported: state.last_idle.is_some() || state.last_tick.is_none(),
        water_step_ml: WATER_STEP_ML,
        water_goal_min_ml: WATER_GOAL_MIN_ML,
        water_goal_max_ml: WATER_GOAL_MAX_ML,
        snooze_minutes: SNOOZE_MINUTES,
        active_break: state.active_break.clone(),
    }
}

fn week(history: &[FocusDay], today: &FocusDay) -> Vec<FocusDay> {
    (0..=HISTORY_DAYS as i64)
        .rev()
        .map(|days_ago| {
            let date = today.date - Duration::days(days_ago);
            if days_ago == 0 {
                return today.clone();
            }
            history
                .iter()
                .find(|day| day.date == date)
                .cloned()
                .unwrap_or_else(|| FocusDay::new(date))
        })
        .collect()
}

/// Millilitres as litres, without trailing zeros: 1250 → "1.25", 2000 → "2".
pub fn litres(ml: u32) -> String {
    let text = format!("{:.2}", f64::from(ml) / 1000.0);
    text.trim_end_matches('0').trim_end_matches('.').to_owned()
}

/// The notification for a break. English, like every other Sajilo reminder.
/// The title and body of a reminder in the notification style. With jokes
/// on, the body is the next line from the kind's deck; water keeps its
/// running total under it, since that number is the point.
pub fn announcement(
    state: &mut FocusState,
    settings: &FocusSettings,
    kind: BreakKind,
    today: &FocusDay,
    language: Language,
) -> (String, String) {
    let (title, plain) = message(kind, today, settings, language);
    let joke = if settings.jokes {
        deal_joke(&mut state.jokes_told, kind)
    } else {
        None
    };
    let body = match (joke, kind) {
        (Some(joke), BreakKind::Water) => {
            format!(
                "{}\n{}",
                joke.text(language),
                water_total(today, settings, language)
            )
        }
        (Some(joke), _) => joke.text(language).to_owned(),
        (None, _) => plain,
    };
    (title, body)
}

/// Today's water against the goal, as a notification says it.
fn water_total(today: &FocusDay, settings: &FocusSettings, language: Language) -> String {
    let (drunk, goal) = (litres(today.water_ml), litres(settings.water_goal_ml));
    match language {
        Language::En => format!("{drunk} of {goal} litres today."),
        Language::Ne => format!(
            "आज {} मध्ये {} लिटर।",
            devanagari_digits(&goal),
            devanagari_digits(&drunk)
        ),
    }
}

fn devanagari_digits(text: &str) -> String {
    text.chars()
        .map(|c| {
            c.to_digit(10)
                .and_then(|d| char::from_u32('०' as u32 + d))
                .unwrap_or(c)
        })
        .collect()
}

/// The plain title and body of a reminder, without a joke.
pub fn message(
    kind: BreakKind,
    today: &FocusDay,
    settings: &FocusSettings,
    language: Language,
) -> (String, String) {
    let (title, body): (&str, String) = match (kind, language) {
        (BreakKind::Custom, Language::En) => (
            &settings.custom.label,
            "Your own reminder, from Sajilo.".to_owned(),
        ),
        (BreakKind::Custom, Language::Ne) => (
            &settings.custom.label,
            "सजिलोबाट तपाईंको आफ्नै रिमाइन्डर।".to_owned(),
        ),
        (BreakKind::Water, _) => (
            match language {
                Language::En => "Drink some water",
                Language::Ne => "पानी पिउनुहोस्",
            },
            match language {
                Language::En => format!(
                    "{} Log it in Sajilo's Routine tab.",
                    water_total(today, settings, language)
                ),
                Language::Ne => format!(
                    "{} सजिलोको दिनचर्या ट्याबमा लेख्नुहोस्।",
                    water_total(today, settings, language)
                ),
            },
        ),
        (BreakKind::Move, Language::En) => (
            "Time to move",
            format!(
                "{} minutes at the screen. Stand up and walk for a couple of minutes.",
                settings.move_break.every_minutes
            ),
        ),
        (BreakKind::Move, Language::Ne) => (
            "उठ्ने बेला भयो",
            format!(
                "{} मिनेट स्क्रिनमा। उठेर दुई-चार मिनेट हिँड्नुहोस्।",
                devanagari_digits(&settings.move_break.every_minutes.to_string())
            ),
        ),
        (kind, language) => {
            let (title, body) = fixed_message(kind, language);
            (title, body.to_owned())
        }
    };
    (title.to_owned(), body)
}

/// The reminders whose words never change.
fn fixed_message(kind: BreakKind, language: Language) -> (&'static str, &'static str) {
    match (kind, language) {
        (BreakKind::Eyes, Language::En) => (
            "Rest your eyes",
            "Look at something about 6 metres away for 20 seconds.",
        ),
        (BreakKind::Eyes, Language::Ne) => {
            ("टाढा हेर्नुहोस्", "२० सेकेन्ड ६ मिटर जति टाढाको कुनै चीज हेर्नुहोस्।")
        }
        (BreakKind::Breakfast, Language::En) => ("Breakfast time", "Food first, laptop later."),
        (BreakKind::Breakfast, Language::Ne) => ("बिहानको खाना खाने बेला", "पहिले खाना, अनि ल्यापटप।"),
        (BreakKind::Lunch, Language::En) => ("Lunch time", "Go and eat. Not later, now."),
        (BreakKind::Lunch, Language::Ne) => ("खाना खाने बेला", "गएर खाना खानुहोस्। पछि होइन, अहिले।"),
        (BreakKind::Dinner, Language::En) => ("Dinner time", "Step away from the screen and eat."),
        (BreakKind::Dinner, Language::Ne) => ("बेलुकाको खाना खाने बेला", "स्क्रिनबाट उठेर खाना खानुहोस्।"),
        (BreakKind::Bedtime, Language::En) => (
            "Bedtime",
            "Laptop off. The internet will still be there tomorrow.",
        ),
        (BreakKind::Bedtime, Language::Ne) => ("सुत्ने बेला भयो", "ल्यापटप बन्द। इन्टरनेट भोलि पनि हुन्छ।"),
        (BreakKind::EndOfDay, Language::En) => (
            "Time to stop work",
            "Wrap up for today. Tomorrow's problems can wait until tomorrow.",
        ),
        (BreakKind::EndOfDay, Language::Ne) => ("काम रोक्ने बेला", "आजलाई काम समेट्ने बेला।"),
        // Handled with their numbers or the user's own words above.
        (BreakKind::Move | BreakKind::Water | BreakKind::Custom, _) => ("", ""),
    }
}
