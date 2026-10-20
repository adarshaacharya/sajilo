//! शब्द: a daily word puzzle in Nepali. Guess the day's three-letter word in
//! six tries; each guess says which letters are in place, which are in the
//! word elsewhere, and which have the right letter with another vowel sign.
//!
//! A "letter" is an akshar, what a reader counts as one: कि, क्ष and न्त्र are
//! one each. Comparing code points instead would call कि and का different
//! letters at the first byte and miss the hint that matters most in Nepali.
//!
//! Everyone gets the same word on the same Nepali day, taken from the words
//! pack in order, so nothing repeats until the list has gone round once.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use crate::calendar::bikram_sambat::gregorian_date_from;
use crate::calendar::nepali_date::NepaliDate;

/// Letters in every answer.
pub const LENGTH: usize = 3;
pub const MAX_GUESSES: usize = 6;

/// Puzzle #1: the day the game came out, 2 Kartik 2083.
fn first_day() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 10, 19).unwrap_or_default()
}

const VIRAMA: char = '\u{094D}';

fn is_consonant(c: char) -> bool {
    ('\u{0915}'..='\u{0939}').contains(&c) || ('\u{0958}'..='\u{095F}').contains(&c)
}

fn is_vowel(c: char) -> bool {
    ('\u{0904}'..='\u{0914}').contains(&c) || matches!(c, '\u{0960}' | '\u{0961}')
}

/// Vowel signs, nukta, anusvara, chandrabindu, visarga: what attaches to the
/// letter before it.
fn is_sign(c: char) -> bool {
    ('\u{0900}'..='\u{0903}').contains(&c)
        || ('\u{093A}'..='\u{094C}').contains(&c)
        || ('\u{094E}'..='\u{094F}').contains(&c)
        || ('\u{0955}'..='\u{0957}').contains(&c)
        || matches!(c, '\u{0962}' | '\u{0963}')
}

fn is_joiner(c: char) -> bool {
    matches!(c, '\u{200C}' | '\u{200D}')
}

/// `word` as aksharas, or `None` if it holds anything but Devanagari letters.
/// A consonant after a virama joins the letter before it: क्ष is one.
pub fn aksharas(word: &str) -> Option<Vec<String>> {
    let mut letters: Vec<String> = Vec::new();
    let mut joining = false;
    for c in word.trim().chars() {
        let starts = is_consonant(c) || is_vowel(c);
        if starts && !joining {
            letters.push(String::new());
        } else if !starts && !is_sign(c) && c != VIRAMA && !is_joiner(c) {
            return None;
        }
        letters.last_mut()?.push(c);
        joining = c == VIRAMA || (joining && is_joiner(c));
    }
    (!letters.is_empty()).then_some(letters)
}

/// The letter without its vowel sign: क for कि, क्ष for क्षा.
fn base(akshar: &str) -> String {
    akshar
        .chars()
        .filter(|c| is_consonant(*c) || is_vowel(*c) || *c == VIRAMA || *c == '\u{093C}')
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub enum ShabdaMark {
    /// The right letter in the right place.
    Correct,
    /// In the word, somewhere else.
    Present,
    /// The right letter here, with another vowel sign: कि for का.
    Close,
    Absent,
}

/// How `guess` compares with `answer`, letter by letter. A letter guessed
/// twice is marked present only as often as the answer has it.
pub fn score(guess: &[String], answer: &[String]) -> Vec<ShabdaMark> {
    let mut marks = vec![ShabdaMark::Absent; guess.len()];
    let mut left: Vec<Option<&str>> = answer.iter().map(|a| Some(a.as_str())).collect();
    for (index, letter) in guess.iter().enumerate() {
        if answer.get(index) == Some(letter) {
            marks[index] = ShabdaMark::Correct;
            left[index] = None;
        }
    }
    for (index, letter) in guess.iter().enumerate() {
        if marks[index] == ShabdaMark::Correct {
            continue;
        }
        if let Some(at) = left.iter().position(|a| *a == Some(letter.as_str())) {
            marks[index] = ShabdaMark::Present;
            left[at] = None;
        } else if answer
            .get(index)
            .is_some_and(|here| base(here) == base(letter))
        {
            marks[index] = ShabdaMark::Close;
        }
    }
    marks
}

/// Which puzzle a Nepali day is: #1 on release day, counting up. `None`
/// outside the calendar or before release.
pub fn number(day: NepaliDate) -> Option<u32> {
    let date = gregorian_date_from(day).ok()?;
    u32::try_from((date - first_day()).num_days() + 1)
        .ok()
        .filter(|n| *n > 0)
}

/// The answer for puzzle `number`: the list in order, round again at the end.
pub fn answer(number: u32, words: &[String]) -> Option<&String> {
    if words.is_empty() {
        return None;
    }
    words.get((number as usize - 1) % words.len())
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct ShabdaStats {
    pub played: u32,
    pub won: u32,
    /// Days won in a row, up to the last one finished.
    pub streak: u32,
    pub best_streak: u32,
    /// Wins by the number of guesses they took: one to six.
    pub distribution: Vec<u32>,
}

/// Everything kept between sessions: today's guesses so far, and the record.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ShabdaState {
    /// The day the guesses are for. Another day starts afresh.
    pub day: Option<NepaliDate>,
    pub guesses: Vec<String>,
    pub stats: ShabdaStats,
    /// The last day played to the end, for the streak.
    pub last_finished: Option<NepaliDate>,
    /// The last day won, for the streak.
    pub last_won: Option<NepaliDate>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub enum ShabdaStatus {
    Playing,
    Won,
    Lost,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GuessError {
    NotDevanagari,
    /// The number of letters it had.
    WrongLength(usize),
    AlreadyGuessed,
    Finished,
}

impl ShabdaState {
    /// Moves to `today`, dropping guesses left from another day.
    pub fn open(&mut self, today: NepaliDate) {
        if self.day != Some(today) {
            self.day = Some(today);
            self.guesses.clear();
        }
    }

    pub fn status(&self, answer: &str) -> ShabdaStatus {
        if self.guesses.iter().any(|guess| guess == answer) {
            ShabdaStatus::Won
        } else if self.guesses.len() >= MAX_GUESSES {
            ShabdaStatus::Lost
        } else {
            ShabdaStatus::Playing
        }
    }

    /// Plays `word` against `answer` on `today`, and records the result
    /// once the puzzle ends.
    pub fn guess(&mut self, today: NepaliDate, word: &str, answer: &str) -> Result<(), GuessError> {
        self.open(today);
        if self.status(answer) != ShabdaStatus::Playing {
            return Err(GuessError::Finished);
        }
        let letters = aksharas(word).ok_or(GuessError::NotDevanagari)?;
        if letters.len() != LENGTH {
            return Err(GuessError::WrongLength(letters.len()));
        }
        let word = letters.concat();
        if self.guesses.contains(&word) {
            return Err(GuessError::AlreadyGuessed);
        }
        self.guesses.push(word);
        let status = self.status(answer);
        if status != ShabdaStatus::Playing {
            self.finish(today, status);
        }
        Ok(())
    }

    fn finish(&mut self, today: NepaliDate, status: ShabdaStatus) {
        let stats = &mut self.stats;
        stats.played += 1;
        if status == ShabdaStatus::Won {
            stats.won += 1;
            let yesterday = previous_day(today);
            stats.streak = if self.last_won.is_some() && self.last_won == yesterday {
                stats.streak + 1
            } else {
                1
            };
            stats.best_streak = stats.best_streak.max(stats.streak);
            stats.distribution.resize(MAX_GUESSES, 0);
            if let Some(slot) = stats.distribution.get_mut(self.guesses.len() - 1) {
                *slot += 1;
            }
            self.last_won = Some(today);
        } else {
            stats.streak = 0;
        }
        self.last_finished = Some(today);
    }

    /// The streak as it stands on `today`: a day missed since the last win
    /// has already broken it.
    pub fn current_streak(&self, today: NepaliDate) -> u32 {
        let yesterday = previous_day(today);
        let recent = self
            .last_won
            .is_some_and(|won| won == today || Some(won) == yesterday);
        if recent { self.stats.streak } else { 0 }
    }
}

fn previous_day(day: NepaliDate) -> Option<NepaliDate> {
    let date = gregorian_date_from(day).ok()?.pred_opt()?;
    crate::calendar::bikram_sambat::nepali_date_from(date).ok()
}

/// The share grid's square for a mark.
pub fn square(mark: ShabdaMark) -> &'static str {
    match mark {
        ShabdaMark::Correct => "🟩",
        ShabdaMark::Present => "🟨",
        ShabdaMark::Close => "🟧",
        ShabdaMark::Absent => "⬜",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn letters(word: &str) -> Vec<String> {
        aksharas(word).unwrap()
    }

    #[test]
    fn letters_as_a_reader_counts_them() {
        assert_eq!(letters("किताब"), ["कि", "ता", "ब"]);
        assert_eq!(letters("अक्षर"), ["अ", "क्ष", "र"]);
        assert_eq!(letters("प्रार्थना"), ["प्रा", "र्थ", "ना"]);
        assert_eq!(letters("बाँसुरी"), ["बाँ", "सु", "री"]);
        assert_eq!(letters("सारङ्गी"), ["सा", "र", "ङ्गी"]);
        assert_eq!(aksharas("kalam"), None);
        assert_eq!(aksharas(""), None);
    }

    #[test]
    fn marks_like_the_game_everyone_knows_plus_close() {
        use ShabdaMark::*;
        // कलम against कमल: क in place; ल and म swapped.
        assert_eq!(
            score(&letters("कलम"), &letters("कमल")),
            [Correct, Present, Present]
        );
        // किसान against कागज: का is not कि, but the letter is right.
        assert_eq!(
            score(&letters("किसान"), &letters("कागज")),
            [Close, Absent, Absent]
        );
        // A letter twice, once in the answer: only one is marked.
        assert_eq!(
            score(&letters("ललक"), &letters("कलम")),
            [Absent, Correct, Present]
        );
    }

    #[test]
    fn everyone_gets_the_same_word_and_none_repeats_until_the_list_ends() {
        let words: Vec<String> = ["कलम", "किताब", "बजार"].map(String::from).to_vec();
        assert_eq!(answer(1, &words).unwrap(), "कलम");
        assert_eq!(answer(3, &words).unwrap(), "बजार");
        assert_eq!(answer(4, &words).unwrap(), "कलम");
        let release = NepaliDate::new(2083, 7, 2);
        assert_eq!(number(release), Some(1));
        assert_eq!(number(NepaliDate::new(2083, 7, 3)), Some(2));
        assert_eq!(number(NepaliDate::new(2083, 7, 1)), None);
    }

    #[test]
    fn a_win_counts_and_the_streak_grows_day_by_day() {
        let mut state = ShabdaState::default();
        let day1 = NepaliDate::new(2083, 7, 3);
        let day2 = NepaliDate::new(2083, 7, 4);
        state.guess(day1, "कमल", "कलम").unwrap();
        state.guess(day1, "कलम", "कलम").unwrap();
        assert_eq!(state.status("कलम"), ShabdaStatus::Won);
        assert_eq!(state.guess(day1, "बजार", "कलम"), Err(GuessError::Finished));
        state.guess(day2, "बजार", "बजार").unwrap();
        assert_eq!(state.stats.streak, 2);
        assert_eq!(state.stats.distribution, [1, 1, 0, 0, 0, 0]);
        // A day missed: the streak has gone.
        assert_eq!(state.current_streak(NepaliDate::new(2083, 7, 6)), 0);
    }

    #[test]
    fn guesses_must_be_three_nepali_letters_and_new() {
        let mut state = ShabdaState::default();
        let day = NepaliDate::new(2083, 7, 3);
        assert_eq!(
            state.guess(day, "पानी", "कलम"),
            Err(GuessError::WrongLength(2))
        );
        assert_eq!(
            state.guess(day, "abc", "कलम"),
            Err(GuessError::NotDevanagari)
        );
        state.guess(day, "बजार", "कलम").unwrap();
        assert_eq!(
            state.guess(day, "बजार", "कलम"),
            Err(GuessError::AlreadyGuessed)
        );
    }

    #[test]
    fn six_misses_lose_and_break_the_streak() {
        let mut state = ShabdaState::default();
        let day = NepaliDate::new(2083, 7, 3);
        for word in ["बजार", "सपना", "मौसम", "पहाड", "बादल", "गमला"]
        {
            state.guess(day, word, "कलम").unwrap();
        }
        assert_eq!(state.status("कलम"), ShabdaStatus::Lost);
        assert_eq!(state.stats.played, 1);
        assert_eq!(state.stats.streak, 0);
    }
}
