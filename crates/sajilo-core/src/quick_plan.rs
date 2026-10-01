//! A day plan typed as one line: `Call dai 3pm remind 15m every month`.
//!
//! The words that say *when* (a time), *how far ahead* (a reminder) and *how
//! often* (a repeat) are picked out and the rest is the title. Each picked
//! part is returned with the exact words it came from, so the screen can show
//! it as a chip, and so a chip the user dismisses can be parsed again with
//! that kind ignored, leaving its words in the title ("3pm" in "Watch 3pm
//! show" stays a title).
//!
//! English and Nepali both: `3pm`, `3:30 pm`, `15:00`, `बेलुका ५ बजे`;
//! `remind 15m`, `remind 1h`, `remind day before`; `every month`, `monthly`,
//! `हरेक महिना`, `वार्षिक`.
//!
//! And the day, read against today: `tomorrow`, `भोलि`, `parsi`, `Friday`,
//! `शुक्रबार`, `Asoj 5`, `५ असोज`. A weekday is the next one on or after
//! today; a month and day the next one on or after today, so `Baishakh 1`
//! typed in Chaitra is next year's.

use serde::{Deserialize, Serialize};

use chrono::{Datelike, Duration};

use crate::calendar::bikram_sambat::{days_in_month, gregorian_date_from, nepali_date_from};
use crate::calendar::nepali_date::NepaliDate;
use crate::numerals::to_ascii_digits;
use crate::planner::{PlanTime, Recurrence, Reminder};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum QuickKind {
    Day,
    Time,
    Reminder,
    Repeat,
}

/// One recognised part, with the words it was read from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickPart {
    pub kind: QuickKind,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickPlan {
    pub title: String,
    /// The day the words named, when they named one other than today.
    pub date: Option<NepaliDate>,
    pub time: Option<PlanTime>,
    /// Minutes before the time, one of [`Reminder::CHOICES`].
    pub reminder: Option<u32>,
    pub recurrence: Recurrence,
    pub parts: Vec<QuickPart>,
    /// The time wasn't given but a reminder was, so it was set to the morning:
    /// a reminder needs a time to count back from.
    pub assumed_time: bool,
}

/// When no time is given but a reminder is: 9 in the morning.
const ASSUMED_TIME: PlanTime = PlanTime { hour: 9, minute: 0 };

struct Word<'a> {
    text: &'a str,
    lower: String,
}

/// Reads `line`, leaving the kinds in `ignore` as plain title words. Day
/// words are read against `today`.
pub fn quick_plan(line: &str, ignore: &[QuickKind], today: NepaliDate) -> QuickPlan {
    let words: Vec<Word> = line
        .split_whitespace()
        .map(|text| Word {
            text,
            lower: to_ascii_digits(text).to_lowercase(),
        })
        .collect();
    let mut used = vec![false; words.len()];
    let mut plan = QuickPlan {
        title: String::new(),
        date: None,
        time: None,
        reminder: None,
        recurrence: Recurrence::None,
        parts: Vec::new(),
        assumed_time: false,
    };
    let take = |kind: QuickKind,
                range: std::ops::Range<usize>,
                used: &mut Vec<bool>,
                parts: &mut Vec<QuickPart>| {
        let text = words[range.clone()]
            .iter()
            .map(|word| word.text)
            .collect::<Vec<_>>()
            .join(" ");
        for index in range {
            used[index] = true;
        }
        parts.push(QuickPart { kind, text });
    };

    if !ignore.contains(&QuickKind::Time)
        && let Some((range, time)) = find_time(&words)
    {
        // "at 3pm": the "at" goes with it.
        let start = if range.start > 0 && words[range.start - 1].lower == "at" {
            range.start - 1
        } else {
            range.start
        };
        plan.time = Some(time);
        take(
            QuickKind::Time,
            start..range.end,
            &mut used,
            &mut plan.parts,
        );
    }
    if !ignore.contains(&QuickKind::Reminder)
        && let Some((range, minutes)) = find_reminder(&words, &used)
    {
        plan.reminder = Some(minutes);
        take(QuickKind::Reminder, range, &mut used, &mut plan.parts);
    }
    if !ignore.contains(&QuickKind::Repeat)
        && let Some((range, recurrence)) = find_repeat(&words, &used)
    {
        plan.recurrence = recurrence;
        take(QuickKind::Repeat, range, &mut used, &mut plan.parts);
    }
    if !ignore.contains(&QuickKind::Day)
        && let Some((range, date)) = find_day(&words, &used, today)
    {
        // "on Friday": the "on" goes with it.
        let start =
            if range.start > 0 && !used[range.start - 1] && words[range.start - 1].lower == "on" {
                range.start - 1
            } else {
                range.start
            };
        plan.date = (date != today).then_some(date);
        take(QuickKind::Day, start..range.end, &mut used, &mut plan.parts);
    }
    if plan.reminder.is_some() && plan.time.is_none() {
        plan.time = Some(ASSUMED_TIME);
        plan.assumed_time = true;
    }
    plan.title = words
        .iter()
        .zip(&used)
        .filter(|(_, used)| !**used)
        .map(|(word, _)| word.text)
        .collect::<Vec<_>>()
        .join(" ");
    plan
}

/// `3`, `03`, `3:30`, `15:00` → (hour, minute).
fn clock(text: &str) -> Option<(u32, u32)> {
    let (hour, minute) = match text.split_once(':') {
        Some((hour, minute)) => (hour, minute),
        None => (text, "0"),
    };
    if hour.is_empty() || hour.len() > 2 || minute.len() > 2 {
        return None;
    }
    let (hour, minute) = (hour.parse::<u32>().ok()?, minute.parse::<u32>().ok()?);
    (hour < 24 && minute < 60).then_some((hour, minute))
}

fn twelve_hour(hour: u32, minute: u32, pm: bool) -> Option<PlanTime> {
    if !(1..=12).contains(&hour) {
        return None;
    }
    let hour = match (hour, pm) {
        (12, false) => 0,
        (12, true) => 12,
        (hour, true) => hour + 12,
        (hour, false) => hour,
    };
    Some(PlanTime { hour, minute })
}

fn find_time(words: &[Word]) -> Option<(std::ops::Range<usize>, PlanTime)> {
    for (index, word) in words.iter().enumerate() {
        let lower = word.lower.trim_end_matches([',', '.']);
        // 3pm, 3:30pm
        for (suffix, pm) in [("am", false), ("pm", true)] {
            if let Some(number) = lower.strip_suffix(suffix)
                && let Some((hour, minute)) = clock(number)
                && let Some(time) = twelve_hour(hour, minute, pm)
            {
                return Some((index..index + 1, time));
            }
        }
        // 3 pm, 3:30 pm
        if let Some((hour, minute)) = clock(lower)
            && let Some(next) = words.get(index + 1)
        {
            let next = next.lower.trim_end_matches([',', '.']);
            if (next == "am" || next == "pm")
                && let Some(time) = twelve_hour(hour, minute, next == "pm")
            {
                return Some((index..index + 2, time));
            }
        }
        // 15:00, 9:30 (a colon makes a bare number a time)
        if lower.contains(':')
            && let Some((hour, minute)) = clock(lower)
        {
            return Some((index..index + 1, PlanTime { hour, minute }));
        }
        // ५ बजे, बेलुका ५:३० बजे
        if let Some((hour, minute)) = clock(lower)
            && words
                .get(index + 1)
                .is_some_and(|next| next.text.starts_with("बजे"))
        {
            let period = index.checked_sub(1).map(|before| words[before].text);
            let pm = match period {
                Some("बिहान") => Some(false),
                Some("दिउँसो" | "बेलुका" | "बेलुकी" | "साँझ" | "राति" | "रात") => {
                    Some(true)
                }
                _ => None,
            };
            let start = if pm.is_some() { index - 1 } else { index };
            // Without a word for the part of the day, an hour before 7 is
            // the afternoon: nobody plans 5 in the morning by default.
            let pm = pm.unwrap_or(hour < 7 || hour == 12);
            let time = if hour > 12 {
                Some(PlanTime { hour, minute })
            } else {
                twelve_hour(hour.max(1), minute, pm)
            };
            if let Some(time) = time {
                return Some((start..index + 2, time));
            }
        }
    }
    None
}

/// The nearest offset the reminder picker offers.
fn snap(minutes: u32) -> u32 {
    Reminder::CHOICES
        .iter()
        .copied()
        .min_by_key(|choice| choice.abs_diff(minutes))
        .unwrap_or(0)
}

/// `15m`, `15min`, `1h`, `2hr`, or `15` then `minutes`.
fn duration(words: &[Word], index: usize) -> Option<(usize, u32)> {
    let word = words.get(index)?.lower.as_str();
    let split = word
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(word.len());
    let (number, unit) = word.split_at(split);
    let number = number.parse::<u32>().ok()?;
    let (unit, width) = if unit.is_empty() {
        (words.get(index + 1)?.lower.as_str(), 2)
    } else {
        (unit, 1)
    };
    let minutes = match unit.trim_end_matches(['s', '.']) {
        "m" | "min" | "minute" | "मिनेट" => number,
        "h" | "hr" | "hour" | "घण्टा" => number * 60,
        "d" | "day" | "दिन" => number * 1440,
        _ => return None,
    };
    Some((width, minutes))
}

fn find_reminder(words: &[Word], used: &[bool]) -> Option<(std::ops::Range<usize>, u32)> {
    let start = words.iter().enumerate().position(|(index, word)| {
        !used[index] && (word.lower == "remind" || word.lower == "reminder")
    })?;
    let mut end = start + 1;
    if words.get(end).is_some_and(|word| word.lower == "me") {
        end += 1;
    }
    let minutes = if let Some((width, minutes)) = duration(words, end) {
        end += width;
        minutes
    } else if words.get(end).is_some_and(|word| word.lower == "day")
        && words
            .get(end + 1)
            .is_some_and(|word| word.lower == "before")
    {
        end += 1;
        1440
    } else if words.get(end).is_some_and(|word| word.lower == "a")
        && words.get(end + 1).is_some_and(|word| word.lower == "day")
    {
        end += 2;
        1440
    } else {
        0
    };
    if words.get(end).is_some_and(|word| word.lower == "before") {
        end += 1;
    }
    Some((start..end, snap(minutes)))
}

fn find_repeat(words: &[Word], used: &[bool]) -> Option<(std::ops::Range<usize>, Recurrence)> {
    for (index, word) in words.iter().enumerate() {
        if used[index] {
            continue;
        }
        let single = match word.lower.as_str() {
            "monthly" | "मासिक" => Some(Recurrence::MonthlyBikramSambat),
            "yearly" | "annually" | "वार्षिक" => Some(Recurrence::YearlyBikramSambat),
            _ => None,
        };
        if let Some(recurrence) = single {
            return Some((index..index + 1, recurrence));
        }
        if matches!(word.lower.as_str(), "every" | "each" | "हरेक" | "प्रत्येक")
            && let Some(next) = words.get(index + 1)
        {
            let recurrence = match next.lower.trim_end_matches(['.', ',']) {
                "month" | "महिना" => Some(Recurrence::MonthlyBikramSambat),
                "year" | "वर्ष" | "साल" => Some(Recurrence::YearlyBikramSambat),
                _ => None,
            };
            if let Some(recurrence) = recurrence {
                return Some((index..index + 2, recurrence));
            }
        }
    }
    None
}

/// Days from today for the words that are a day on their own.
fn relative_day(word: &str) -> Option<i64> {
    Some(match word {
        "today" | "aaja" | "aja" | "आज" => 0,
        "tomorrow" | "tmrw" | "tmr" | "bholi" | "भोलि" | "भोली" => 1,
        "parsi" | "पर्सि" | "पर्सी" => 2,
        _ => return None,
    })
}

/// 0 for Sunday, as `chrono::Weekday::num_days_from_sunday`.
fn weekday(word: &str) -> Option<i64> {
    let word = word.trim_end_matches("मा");
    Some(match word {
        "sun" | "sunday" | "aaitabar" | "aitabar" | "आइतबार" | "आइतवार" => {
            0
        }
        "mon" | "monday" | "sombar" | "सोमबार" | "सोमवार" => 1,
        "tue" | "tues" | "tuesday" | "mangalbar" | "मंगलबार" | "मङ्गलबार" | "मंगलवार" => {
            2
        }
        "wed" | "wednesday" | "budhabar" | "budhbar" | "बुधबार" | "बुधवार" => {
            3
        }
        "thu" | "thur" | "thurs" | "thursday" | "bihibar" | "बिहीबार" | "बिहिबार" | "बिहीवार" => {
            4
        }
        "fri" | "friday" | "sukrabar" | "shukrabar" | "शुक्रबार" | "शुक्रवार" => {
            5
        }
        "sat" | "saturday" | "sanibar" | "shanibar" | "शनिबार" | "शनिवार" => {
            6
        }
        _ => return None,
    })
}

/// A Bikram Sambat month, by any common spelling.
fn month(word: &str) -> Option<u32> {
    Some(match word {
        "baishakh" | "baisakh" | "baisakh," | "vaisakh" | "बैशाख" | "वैशाख" | "बैसाख" => {
            1
        }
        "jestha" | "jeth" | "jeth," | "जेठ" | "ज्येष्ठ" => 2,
        "asar" | "asadh" | "ashadh" | "असार" | "आषाढ" => 3,
        "shrawan" | "saun" | "sawan" | "shravan" | "साउन" | "श्रावण" => 4,
        "bhadra" | "bhadau" | "भदौ" | "भाद्र" => 5,
        "ashwin" | "asoj" | "असोज" | "आश्विन" => 6,
        "kartik" | "kattik" | "कार्तिक" | "कात्तिक" => 7,
        "mangsir" | "mansir" | "मंसिर" | "मङ्सिर" => 8,
        "poush" | "push" | "paush" | "पुस" | "पुष" | "पौष" => 9,
        "magh" | "माघ" => 10,
        "falgun" | "phagun" | "fagun" | "फागुन" | "फाल्गुन" => 11,
        "chaitra" | "chait" | "चैत" | "चैत्र" => 12,
        _ => return None,
    })
}

fn day_number(word: &str) -> Option<u32> {
    let word = word.trim_end_matches("गते").trim_end_matches(',');
    word.parse().ok().filter(|day| (1..=32).contains(day))
}

fn days_after(today: NepaliDate, days: i64) -> Option<NepaliDate> {
    let gregorian = gregorian_date_from(today).ok()? + Duration::days(days);
    nepali_date_from(gregorian).ok()
}

/// The next `month`/`day` on or after today, if that day exists.
fn next_month_day(today: NepaliDate, month: u32, day: u32) -> Option<NepaliDate> {
    let year = if (month, day) >= (today.month, today.day) {
        today.year
    } else {
        today.year + 1
    };
    let length = u32::try_from(days_in_month(year, month)?).ok()?;
    (day <= length).then_some(NepaliDate { year, month, day })
}

fn find_day(
    words: &[Word],
    used: &[bool],
    today: NepaliDate,
) -> Option<(std::ops::Range<usize>, NepaliDate)> {
    let free = |index: usize| index < words.len() && !used[index];
    for index in 0..words.len() {
        if !free(index) {
            continue;
        }
        let word = words[index].lower.as_str();
        // "day after tomorrow"
        if word == "day"
            && free(index + 2)
            && words[index + 1].lower == "after"
            && words[index + 2].lower == "tomorrow"
        {
            return Some((index..index + 3, days_after(today, 2)?));
        }
        if let Some(days) = relative_day(word) {
            return Some((index..index + 1, days_after(today, days)?));
        }
        if let Some(target) = weekday(word) {
            let now = i64::from(
                gregorian_date_from(today)
                    .ok()?
                    .weekday()
                    .num_days_from_sunday(),
            );
            // "next Friday" reads the same as "Friday": the next one.
            let start = if index > 0 && free(index - 1) && words[index - 1].lower == "next" {
                index - 1
            } else {
                index
            };
            return Some((
                start..index + 1,
                days_after(today, (target - now).rem_euclid(7))?,
            ));
        }
        if let Some(month) = month(word) {
            if free(index + 1)
                && let Some(day) = day_number(&words[index + 1].lower)
                && let Some(date) = next_month_day(today, month, day)
            {
                return Some((index..index + 2, date));
            }
            if index > 0
                && free(index - 1)
                && let Some(day) = day_number(&words[index - 1].lower)
                && let Some(date) = next_month_day(today, month, day)
            {
                return Some((index - 1..index + 1, date));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[allow(clippy::unnecessary_wraps)]
    fn at(hour: u32, minute: u32) -> Option<PlanTime> {
        Some(PlanTime { hour, minute })
    }

    /// A Thursday: 2083 Asoj 15 is 2026-10-01.
    const TODAY: NepaliDate = NepaliDate {
        year: 2083,
        month: 6,
        day: 15,
    };

    fn quick_plan(line: &str, ignore: &[QuickKind]) -> QuickPlan {
        super::quick_plan(line, ignore, TODAY)
    }

    #[allow(clippy::unnecessary_wraps)]
    fn on(month: u32, day: u32) -> Option<NepaliDate> {
        Some(NepaliDate {
            year: 2083,
            month,
            day,
        })
    }

    #[test]
    fn reads_the_day() {
        let plan = quick_plan("Dentist tomorrow 9am", &[]);
        assert_eq!((plan.title.as_str(), plan.date), ("Dentist", on(6, 16)));
        assert_eq!(quick_plan("भोलि बेलुका ५ बजे फोन", &[]).date, on(6, 16));
        assert_eq!(quick_plan("Bus day after tomorrow", &[]).date, on(6, 17));
        assert_eq!(quick_plan("Bus parsi", &[]).date, on(6, 17));
        assert_eq!(
            quick_plan("Rent today", &[]).date,
            None,
            "today is no change"
        );
        assert_eq!(quick_plan("Rent today", &[]).title, "Rent");
    }

    #[test]
    fn reads_a_weekday_as_the_next_one() {
        let plan = quick_plan("Standup on Friday", &[]);
        assert_eq!((plan.title.as_str(), plan.date), ("Standup", on(6, 16)));
        assert_eq!(quick_plan("Gym next mon", &[]).date, on(6, 19));
        assert_eq!(quick_plan("शनिबार पिकनिक", &[]).date, on(6, 17));
        assert_eq!(
            quick_plan("Review thursday", &[]).date,
            None,
            "today's weekday is today"
        );
    }

    #[test]
    fn reads_a_month_and_day() {
        assert_eq!(quick_plan("Tihar shopping Kartik 20", &[]).date, on(7, 20));
        assert_eq!(
            quick_plan("दशैं टीका ५ असोज", &[]).date.map(|d| d.year),
            Some(2084)
        );
        assert_eq!(
            quick_plan("New year Baishakh 1", &[]).date,
            Some(NepaliDate::new(2084, 1, 1))
        );
        assert_eq!(
            quick_plan("Party Asoj 40", &[]).date,
            None,
            "no such day stays words"
        );
    }

    #[test]
    fn picks_out_time_reminder_and_repeat() {
        let plan = quick_plan("Call dai 3pm remind 15m every month", &[]);
        assert_eq!(plan.title, "Call dai");
        assert_eq!(plan.time, at(15, 0));
        assert_eq!(plan.reminder, Some(15));
        assert_eq!(plan.recurrence, Recurrence::MonthlyBikramSambat);
        let texts: Vec<_> = plan.parts.iter().map(|part| part.text.as_str()).collect();
        assert_eq!(texts, ["3pm", "remind 15m", "every month"]);
    }

    #[test]
    fn reads_the_ways_people_write_a_time() {
        assert_eq!(quick_plan("Standup at 9:30 am", &[]).time, at(9, 30));
        assert_eq!(quick_plan("Standup at 9:30 am", &[]).title, "Standup");
        assert_eq!(quick_plan("Gym 18:00", &[]).time, at(18, 0));
        assert_eq!(quick_plan("Lunch 12pm", &[]).time, at(12, 0));
        assert_eq!(quick_plan("Flight 12am", &[]).time, at(0, 0));
        assert_eq!(
            quick_plan("Buy 3 kg rice", &[]).time,
            None,
            "a bare number is not a time"
        );
    }

    #[test]
    fn reads_nepali() {
        let plan = quick_plan("दाइलाई फोन बेलुका ५ बजे हरेक महिना", &[]);
        assert_eq!(plan.title, "दाइलाई फोन");
        assert_eq!(plan.time, at(17, 0));
        assert_eq!(plan.recurrence, Recurrence::MonthlyBikramSambat);
        assert_eq!(quick_plan("बिहान ७:३० बजे योग", &[]).time, at(7, 30));
        assert_eq!(
            quick_plan("३ बजे मिटिङ", &[]).time,
            at(15, 0),
            "no part of day: the afternoon"
        );
    }

    #[test]
    fn reminders_snap_and_need_a_time() {
        assert_eq!(
            quick_plan("Bill remind me 1 hour before", &[]).reminder,
            Some(60)
        );
        assert_eq!(
            quick_plan("Bill 5pm remind 20m", &[]).reminder,
            Some(15),
            "nearest offered"
        );
        let plan = quick_plan("Passport renewal remind day before", &[]);
        assert_eq!(plan.reminder, Some(1440));
        assert_eq!((plan.time, plan.assumed_time), (at(9, 0), true));
        assert_eq!(plan.title, "Passport renewal");
    }

    #[test]
    fn a_dismissed_part_stays_in_the_title() {
        let plan = quick_plan("Watch 3pm show", &[QuickKind::Time]);
        assert_eq!((plan.title.as_str(), plan.time), ("Watch 3pm show", None));
        assert!(plan.parts.is_empty());
    }
}
