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
//! - **Never nag at the wrong moment.** Outside work hours, on days off, on
//!   public holidays and while paused, nothing is due.

use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use serde::{Deserialize, Serialize};

use crate::calendar::bikram_sambat::nepali_date_from;
use crate::calendar::events;
use crate::planner::PlanTime;

/// Input within this long counts as being at the computer: reading a page
/// without touching the mouse is still screen time.
pub const ACTIVE_WINDOW_SECONDS: u32 = 60;
/// Away this long is a break in itself, so the eye and movement timers start
/// over. Water is not reset: stepping away is not drinking.
pub const AWAY_RESET_SECONDS: u32 = 5 * 60;
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

    /// Idle this long after a reminder means the break was taken. Water has no
    /// such signal; it is logged by hand.
    fn rest_seconds(self) -> Option<u32> {
        match self {
            Self::Eyes => Some(20),
            Self::Move => Some(2 * 60),
            _ => None,
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

    /// How long the break card counts down. The others wait for a button.
    pub fn break_seconds(self) -> u32 {
        match self {
            Self::Eyes => 20,
            Self::Move => 2 * 60,
            _ => 0,
        }
    }

    /// The interval, in minutes, the editor accepts: typed freely, from five
    /// minutes to eight hours. Timers count only time at the computer in work
    /// hours and restart each morning, so anything longer could never come
    /// due. The end-of-work nudge has no interval.
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
    /// Millilitres a day. Water reminders stop once it is reached.
    pub water_goal_ml: u32,
    pub work_start: PlanTime,
    pub work_end: PlanTime,
    /// Sunday first. Saturday is the one day off everyone shares.
    pub work_days: [bool; 7],
    /// Quiet on the public holidays in the bundled calendar.
    pub skip_public_holidays: bool,
    pub style: ReminderStyle,
    /// A soft sound with each reminder, whichever style it takes.
    pub chime: bool,
    /// A rotating joke on the card instead of the plain instruction. Off for
    /// offices where a card about kidneys would not go down well.
    pub jokes: bool,
    /// The user's own reminder.
    pub custom: CustomBreak,
    /// One card when work hours end, if still at the computer.
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
            water_goal_ml: DEFAULT_WATER_GOAL_ML,
            work_start: PlanTime { hour: 9, minute: 0 },
            work_end: PlanTime {
                hour: 18,
                minute: 0,
            },
            work_days: [true, true, true, true, true, true, false],
            skip_public_holidays: true,
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
    /// reminders". Intervals, the water goal and work hours are kept, so
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
        self.work_start = clamp_time(self.work_start);
        self.work_end = clamp_time(self.work_end);
        self
    }

    fn is_work_day(&self, date: NaiveDate) -> bool {
        self.work_days[date.weekday().num_days_from_sunday() as usize]
    }

    /// Whether `time` falls inside work hours. An end before the start is an
    /// overnight shift; equal times mean all day.
    fn in_work_hours(&self, time: NaiveTime) -> bool {
        let start = as_time(self.work_start);
        let end = as_time(self.work_end);
        match start.cmp(&end) {
            std::cmp::Ordering::Less => start <= time && time < end,
            std::cmp::Ordering::Greater => time >= start || time < end,
            std::cmp::Ordering::Equal => true,
        }
    }
}

impl FocusSettings {
    /// Whether `time` is in the three hours after work ends, when a nudge to
    /// stop still means something. Never when work hours are all day.
    fn just_after_work(&self, time: NaiveTime) -> bool {
        let start = as_time(self.work_start);
        let end = as_time(self.work_end);
        if start == end {
            return false;
        }
        let since_end = time.signed_duration_since(end);
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
}

impl FocusDay {
    fn new(date: NaiveDate) -> Self {
        Self {
            date,
            screen_seconds: 0,
            water_ml: 0,
            eyes: BreakCount::default(),
            move_break: BreakCount::default(),
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

/// A break card showing now.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveBreak {
    pub kind: BreakKind,
    pub started_at: DateTime<Utc>,
    /// Length of its countdown; 0 for water, which waits for a button.
    pub seconds: u32,
    /// Opened from "Show me an example": closing it counts for nothing.
    #[serde(default)]
    pub preview: bool,
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
}

/// Why reminders are or are not counting down right now.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FocusStatus {
    /// Every reminder is switched off.
    Off,
    Paused,
    DayOff,
    Holiday,
    OutsideHours,
    Away,
    Active,
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
    if !settings.is_work_day(local.date()) {
        return Some(FocusStatus::DayOff);
    }
    if settings.skip_public_holidays && state.is_public_holiday(local.date()) {
        return Some(FocusStatus::Holiday);
    }
    if !settings.in_work_hours(local.time()) {
        return Some(FocusStatus::OutsideHours);
    }
    None
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
    state.last_idle = tick.idle_seconds;
    if state.paused_until.is_some_and(|until| tick.now >= until) {
        state.paused_until = None;
    }
    if state.active_break.is_some_and(|card| {
        tick.now - card.started_at
            > Duration::seconds(i64::from(card.seconds) + CARD_TIMEOUT_SECONDS)
    }) {
        state.active_break = None;
    }

    // Asleep, shut, or not running: the gap itself was time away.
    let idle = if elapsed > MAX_TICK_GAP_SECONDS {
        elapsed
    } else {
        tick.idle_seconds.unwrap_or(0)
    };
    let active = if elapsed > MAX_TICK_GAP_SECONDS {
        0
    } else {
        active_part(elapsed, idle)
    };

    let today = state.day_mut(date);
    today.screen_seconds = today.screen_seconds.saturating_add(active);

    settle_reminders(state, date, idle, tick.now);
    if idle >= AWAY_RESET_SECONDS {
        state.since_break[0] = 0;
        state.since_break[1] = 0;
    }

    if let Some(kind) = routine_due(state, settings, tick, idle) {
        return vec![kind];
    }

    if end_of_day_due(state, settings, tick, idle) {
        state.end_of_day_sent = Some(date);
        open_card(state, settings, BreakKind::EndOfDay, tick.now);
        return vec![BreakKind::EndOfDay];
    }

    if quiet_reason(state, settings, tick.now, tick.local).is_some() {
        return Vec::new();
    }

    let mut due = Vec::new();
    for kind in BreakKind::ALL {
        let rule = settings.rule(kind);
        let Some(index) = kind.slot() else {
            continue;
        };
        if !rule.enabled {
            continue;
        }
        state.since_break[index] = state.since_break[index].saturating_add(active);
        if state.since_break[index] < rule.every_seconds() || state.awaiting[index].is_some() {
            continue;
        }
        state.since_break[index] = 0;
        let today = state.day_mut(date);
        if kind == BreakKind::Water && today.water_ml >= settings.water_goal_ml {
            continue;
        }
        if let Some(count) = today.count_mut(kind) {
            count.reminded += 1;
        }
        state.awaiting[index] = Some(tick.now);
        due.push(kind);
    }

    // Standing up rests the eyes too: when both come due together, the
    // movement break is the one asked for.
    if due.contains(&BreakKind::Move) && due.contains(&BreakKind::Eyes) {
        due.retain(|kind| *kind != BreakKind::Eyes);
        state.awaiting[0] = None;
        let today = state.day_mut(date);
        today.eyes.reminded = today.eyes.reminded.saturating_sub(1);
    }

    if let Some(kind) = due.first().copied() {
        open_card(state, settings, kind, tick.now);
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
        state.active_break = Some(ActiveBreak {
            kind,
            started_at: now,
            seconds: kind.break_seconds(),
            preview: false,
        });
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

/// Once a work day, in the hours after work ends, and only to someone still
/// at the computer: a nudge to someone who has already left is noise.
fn end_of_day_due(state: &mut FocusState, settings: &FocusSettings, tick: Tick, idle: u32) -> bool {
    let date = tick.local.date();
    settings.end_of_day
        && !card_showing(state, settings)
        && settings.any_enabled()
        && state.end_of_day_sent != Some(date)
        && state.end_of_day_after.is_none_or(|after| tick.now >= after)
        && state.paused_until.is_none_or(|until| tick.now >= until)
        && idle <= ACTIVE_WINDOW_SECONDS
        && settings.is_work_day(date)
        && !(settings.skip_public_holidays && state.is_public_holiday(date))
        && settings.just_after_work(tick.local.time())
}

/// Opens an example card, so someone deciding whether to turn reminders on
/// sees exactly what they would get. It changes no count and no timer.
pub fn preview_break(state: &mut FocusState, kind: BreakKind, now: DateTime<Utc>) {
    state.active_break = Some(ActiveBreak {
        kind,
        started_at: now,
        seconds: kind.break_seconds(),
        preview: true,
    });
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
        if outcome == BreakOutcome::Snooze {
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
    match outcome {
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
fn settle_reminders(state: &mut FocusState, date: NaiveDate, idle: u32, now: DateTime<Utc>) {
    for kind in BreakKind::ALL {
        let Some(index) = kind.slot() else {
            continue;
        };
        let Some(sent) = state.awaiting[index] else {
            continue;
        };
        if kind.rest_seconds().is_some_and(|rest| idle >= rest) {
            if let Some(count) = state.day_mut(date).count_mut(kind) {
                count.taken += 1;
            }
            state.awaiting[index] = None;
        } else if now - sent > kind.answer_window() {
            state.awaiting[index] = None;
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
    /// Minutes of computer use until it is due; `None` while nothing counts
    /// down, or once today's water goal is met.
    pub minutes_left: Option<u32>,
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
    let breaks = BreakKind::ALL
        .into_iter()
        .map(|kind| {
            let rule = settings.rule(kind);
            let goal_met = kind == BreakKind::Water && today.water_ml >= settings.water_goal_ml;
            let used = kind.slot().map_or(0, |slot| state.since_break[slot]);
            NextBreak {
                kind,
                enabled: rule.enabled,
                every_minutes: rule.every_minutes,
                min_minutes: kind.interval_range().0,
                max_minutes: kind.interval_range().1,
                minutes_left: (rule.enabled && counting && !goal_met)
                    .then(|| rule.every_seconds().saturating_sub(used).div_ceil(60)),
            }
        })
        .collect();
    FocusSnapshot {
        settings: settings.clone(),
        status,
        week: week(&state.history, &today),
        today,
        breaks,
        paused_until: state.paused_until.filter(|until| now < *until),
        idle_supported: state.last_idle.is_some() || state.last_tick.is_none(),
        water_step_ml: WATER_STEP_ML,
        water_goal_min_ml: WATER_GOAL_MIN_ML,
        water_goal_max_ml: WATER_GOAL_MAX_ML,
        snooze_minutes: SNOOZE_MINUTES,
        active_break: state.active_break,
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
pub fn message(kind: BreakKind, today: &FocusDay, settings: &FocusSettings) -> (String, String) {
    match kind {
        BreakKind::Eyes => (
            "Rest your eyes".to_owned(),
            "Look at something about 6 metres away for 20 seconds.".to_owned(),
        ),
        BreakKind::Move => (
            "Time to move".to_owned(),
            format!(
                "{} minutes at the screen. Stand up and walk for a couple of minutes.",
                settings.move_break.every_minutes
            ),
        ),
        BreakKind::Custom => (
            settings.custom.label.clone(),
            "Your own reminder, from Sajilo.".to_owned(),
        ),
        BreakKind::Breakfast => (
            "Breakfast time".to_owned(),
            "Food first, laptop later.".to_owned(),
        ),
        BreakKind::Lunch => (
            "Lunch time".to_owned(),
            "Go and eat. Not later, now.".to_owned(),
        ),
        BreakKind::Dinner => (
            "Dinner time".to_owned(),
            "Step away from the screen and eat.".to_owned(),
        ),
        BreakKind::Bedtime => (
            "Bedtime".to_owned(),
            "Laptop off. The internet will still be there tomorrow.".to_owned(),
        ),
        BreakKind::EndOfDay => (
            "Work hours are over".to_owned(),
            "Time to wrap up. Tomorrow's problems can wait until tomorrow.".to_owned(),
        ),
        BreakKind::Water => (
            "Drink some water".to_owned(),
            format!(
                "{} of {} L today. Log it in Sajilo's Breaks tab.",
                litres(today.water_ml),
                litres(settings.water_goal_ml)
            ),
        ),
    }
}
