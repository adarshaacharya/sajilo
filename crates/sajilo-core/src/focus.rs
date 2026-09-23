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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BreakKind {
    /// The 20-20-20 rule: every 20 minutes, look about 6 m (20 ft) away for
    /// 20 seconds.
    Eyes,
    /// Stand up and walk for a couple of minutes.
    Move,
    Water,
}

impl BreakKind {
    pub const ALL: [Self; 3] = [Self::Eyes, Self::Move, Self::Water];

    fn index(self) -> usize {
        match self {
            Self::Eyes => 0,
            Self::Move => 1,
            Self::Water => 2,
        }
    }

    /// Idle this long after a reminder means the break was taken. Water has no
    /// such signal; glasses are logged by hand.
    fn rest_seconds(self) -> Option<u32> {
        match self {
            Self::Eyes => Some(20),
            Self::Move => Some(2 * 60),
            Self::Water => None,
        }
    }

    /// How long a reminder waits to see its break taken before counting it
    /// as skipped.
    fn answer_window(self) -> Duration {
        match self {
            Self::Eyes => Duration::minutes(3),
            Self::Move | Self::Water => Duration::minutes(15),
        }
    }

    /// The intervals offered in the editor, in minutes.
    pub fn interval_choices(self) -> &'static [u32] {
        match self {
            Self::Eyes => &[20, 30, 45, 60],
            Self::Move => &[30, 45, 60, 90, 120],
            Self::Water => &[30, 45, 60, 90, 120],
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
    /// Glasses a day. Water reminders stop once it is reached.
    pub water_goal: u32,
    pub work_start: PlanTime,
    pub work_end: PlanTime,
    /// Sunday first. Saturday is the one day off everyone shares.
    pub work_days: [bool; 7],
    /// Quiet on the public holidays in the bundled calendar.
    pub skip_public_holidays: bool,
}

impl Default for FocusSettings {
    fn default() -> Self {
        Self {
            eyes: BreakRule::off(20),
            move_break: BreakRule::off(60),
            water: BreakRule::off(60),
            water_goal: 8,
            work_start: PlanTime { hour: 9, minute: 0 },
            work_end: PlanTime {
                hour: 18,
                minute: 0,
            },
            work_days: [true, true, true, true, true, true, false],
            skip_public_holidays: true,
        }
    }
}

impl FocusSettings {
    pub fn rule(&self, kind: BreakKind) -> BreakRule {
        match kind {
            BreakKind::Eyes => self.eyes,
            BreakKind::Move => self.move_break,
            BreakKind::Water => self.water,
        }
    }

    pub fn any_enabled(&self) -> bool {
        BreakKind::ALL.iter().any(|kind| self.rule(*kind).enabled)
    }

    /// The recommended set, switched on from the Focus screen's first card.
    #[must_use]
    pub fn with_recommended_breaks(mut self) -> Self {
        self.eyes.enabled = true;
        self.move_break.enabled = true;
        self.water.enabled = true;
        self
    }

    /// Keeps values from an older or hand-edited store within what the editor
    /// can show.
    #[must_use]
    pub fn normalised(mut self) -> Self {
        for kind in BreakKind::ALL {
            let rule = match kind {
                BreakKind::Eyes => &mut self.eyes,
                BreakKind::Move => &mut self.move_break,
                BreakKind::Water => &mut self.water,
            };
            if !kind.interval_choices().contains(&rule.every_minutes) {
                rule.every_minutes = kind.interval_choices()[0];
            }
        }
        self.water_goal = self.water_goal.clamp(1, 20);
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
    pub water_glasses: u32,
    pub eyes: BreakCount,
    #[serde(rename = "move")]
    pub move_break: BreakCount,
}

impl FocusDay {
    fn new(date: NaiveDate) -> Self {
        Self {
            date,
            screen_seconds: 0,
            water_glasses: 0,
            eyes: BreakCount::default(),
            move_break: BreakCount::default(),
        }
    }

    fn count_mut(&mut self, kind: BreakKind) -> Option<&mut BreakCount> {
        match kind {
            BreakKind::Eyes => Some(&mut self.eyes),
            BreakKind::Move => Some(&mut self.move_break),
            BreakKind::Water => None,
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
    /// [`BreakKind::index`].
    pub since_break: [u32; 3],
    /// When each kind's latest reminder went out, while it waits to see the
    /// break taken.
    pub awaiting: [Option<DateTime<Utc>>; 3],
    pub paused_until: Option<DateTime<Utc>>,
    /// Idle seconds at the latest tick; `None` where the platform cannot say.
    pub last_idle: Option<u32>,
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
            self.since_break = [0; 3];
            self.awaiting = [None; 3];
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

fn public_holiday(date: NaiveDate) -> bool {
    nepali_date_from(date).is_ok_and(|bs| {
        events::events(bs.year, bs.month)
            .get(&bs.day)
            .is_some_and(|event| event.is_public_holiday)
    })
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
        state.since_break[BreakKind::Eyes.index()] = 0;
        state.since_break[BreakKind::Move.index()] = 0;
    }

    if quiet_reason(state, settings, tick.now, tick.local).is_some() {
        return Vec::new();
    }

    let mut due = Vec::new();
    for kind in BreakKind::ALL {
        let rule = settings.rule(kind);
        if !rule.enabled {
            continue;
        }
        let index = kind.index();
        state.since_break[index] = state.since_break[index].saturating_add(active);
        if state.since_break[index] < rule.every_seconds() || state.awaiting[index].is_some() {
            continue;
        }
        state.since_break[index] = 0;
        let today = state.day_mut(date);
        if kind == BreakKind::Water && today.water_glasses >= settings.water_goal {
            continue;
        }
        if let Some(count) = today.count_mut(kind) {
            count.reminded += 1;
        }
        state.awaiting[index] = Some(tick.now);
        due.push(kind);
    }
    due
}

/// Resolves reminders waiting for an answer: a quiet computer soon after means
/// the break was taken; silence past the window means it was skipped.
fn settle_reminders(state: &mut FocusState, date: NaiveDate, idle: u32, now: DateTime<Utc>) {
    for kind in BreakKind::ALL {
        let index = kind.index();
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

/// Logs (or, with a negative `delta`, takes back) glasses of water today.
pub fn log_water(state: &mut FocusState, local: NaiveDateTime, delta: i32) {
    let today = state.day_mut(local.date());
    today.water_glasses = today.water_glasses.saturating_add_signed(delta).min(99);
    // Drinking answers a pending water reminder, and restarts its timer.
    if delta > 0 {
        state.awaiting[BreakKind::Water.index()] = None;
        state.since_break[BreakKind::Water.index()] = 0;
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
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NextBreak {
    pub kind: BreakKind,
    pub enabled: bool,
    pub every_minutes: u32,
    /// The intervals the editor offers, so the screen never keeps its own list.
    pub choices: Vec<u32>,
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
            let goal_met = kind == BreakKind::Water && today.water_glasses >= settings.water_goal;
            let used = state.since_break[kind.index()];
            NextBreak {
                kind,
                enabled: rule.enabled,
                every_minutes: rule.every_minutes,
                choices: kind.interval_choices().to_vec(),
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
        BreakKind::Water => (
            "Drink some water".to_owned(),
            format!(
                "{} of {} glasses today. Log it in Sajilo's Focus tab.",
                today.water_glasses, settings.water_goal
            ),
        ),
    }
}
