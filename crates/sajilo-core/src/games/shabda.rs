//! शब्द: a word to find letter by letter, from its clue. Each akshar starts
//! hidden; a guessed letter fills every place it is in, vowel signs and all,
//! and six wrong letters lose the word. The next word follows at once, and
//! none repeats until every word has been played.
//!
//! The letters guessed are the alphabet's: the consonants and the vowels.
//! An akshar shows once each letter in it is found, so स्पा needs both स and
//! प, while the ा, ि and ं that join them come free.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

/// Aksharas in every answer.
pub const LENGTH: usize = 3;
/// Wrong letters, hints included, that lose the word.
pub const MAX_WRONG: u32 = 6;

/// The letters to guess with, in the alphabet's order.
pub const VOWELS: [char; 11] = ['अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ऋ', 'ए', 'ऐ', 'ओ', 'औ'];
pub const CONSONANTS: [char; 33] = [
    'क', 'ख', 'ग', 'घ', 'ङ', 'च', 'छ', 'ज', 'झ', 'ञ', 'ट', 'ठ', 'ड', 'ढ', 'ण', 'त', 'थ', 'द', 'ध',
    'न', 'प', 'फ', 'ब', 'भ', 'म', 'य', 'र', 'ल', 'व', 'श', 'ष', 'स', 'ह',
];

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

/// A dotted letter is found with its plain one: ड़ with ड.
fn plain(c: char) -> char {
    match c {
        '\u{0958}' => 'क',
        '\u{0959}' => 'ख',
        '\u{095A}' => 'ग',
        '\u{095B}' => 'ज',
        '\u{095C}' => 'ड',
        '\u{095D}' => 'ढ',
        '\u{095E}' => 'फ',
        '\u{095F}' => 'य',
        other => other,
    }
}

/// The letters to find in one akshar: स and प for स्पा, इ for इ.
pub fn letters_in(akshar: &str) -> Vec<char> {
    let mut found = Vec::new();
    for c in akshar.chars().filter(|c| is_consonant(*c) || is_vowel(*c)) {
        let c = plain(c);
        if !found.contains(&c) {
            found.push(c);
        }
    }
    found
}

/// Whether `c` is one of the letters to guess with.
pub fn is_key(c: char) -> bool {
    VOWELS.contains(&c) || CONSONANTS.contains(&c)
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
    /// Words found in a row, up to the last one finished.
    pub run: u32,
    pub best_run: u32,
}

/// Everything kept between sessions: the word under way, what has been
/// guessed in it, the words already played, and the record.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ShabdaState {
    pub word: Option<String>,
    /// Letters guessed in this word, in the order tried.
    pub guessed: Vec<char>,
    /// Hints taken in this word; each costs a life.
    pub hints: u32,
    /// Words played since the list last went round.
    pub seen: BTreeSet<String>,
    pub stats: ShabdaStats,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GuessError {
    /// Not one of the letters to guess with.
    NotALetter,
    AlreadyGuessed,
    Finished,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HintError {
    Finished,
    /// A hint would lose the word, or show its last letter.
    NoneLeft,
}

impl ShabdaState {
    /// The word's aksharas, or none before the first word.
    pub fn aksharas(&self) -> Vec<String> {
        self.word.as_deref().and_then(aksharas).unwrap_or_default()
    }

    fn found(&self, akshar: &str) -> bool {
        letters_in(akshar)
            .iter()
            .all(|letter| self.guessed.contains(letter))
    }

    /// Each akshar's place: whether it is showing yet.
    pub fn shown(&self) -> Vec<bool> {
        self.aksharas().iter().map(|a| self.found(a)).collect()
    }

    /// Whether `letter` is somewhere in the word.
    pub fn has(&self, letter: char) -> bool {
        self.aksharas()
            .iter()
            .any(|akshar| letters_in(akshar).contains(&letter))
    }

    /// Lives spent: wrong letters and hints.
    pub fn wrong(&self) -> u32 {
        let misses = self.guessed.iter().filter(|c| !self.has(**c)).count() as u32;
        misses + self.hints
    }

    pub fn status(&self) -> ShabdaStatus {
        let shown = self.shown();
        if !shown.is_empty() && shown.iter().all(|s| *s) {
            ShabdaStatus::Won
        } else if self.wrong() >= MAX_WRONG {
            ShabdaStatus::Lost
        } else {
            ShabdaStatus::Playing
        }
    }

    /// Starts the next word: one not played since the list last went round,
    /// picked with `seed`. A word left unfinished counts as lost.
    pub fn next(&mut self, words: &[String], seed: u64) {
        if self.word.is_some() && self.status() == ShabdaStatus::Playing {
            self.record(ShabdaStatus::Lost);
        }
        let current = self.word.clone();
        let mut fresh: Vec<&String> = words.iter().filter(|w| !self.seen.contains(*w)).collect();
        if fresh.is_empty() {
            // Round again, without the word just played coming straight back.
            self.seen.clear();
            fresh = words
                .iter()
                .filter(|w| Some(*w) != current.as_ref())
                .collect();
        }
        let Some(word) = fresh.get((seed % fresh.len().max(1) as u64) as usize) else {
            return;
        };
        self.seen.insert((*word).clone());
        self.word = Some((*word).clone());
        self.guessed.clear();
        self.hints = 0;
    }

    /// Tries `letter`. Returns whether it is in the word.
    pub fn guess(&mut self, letter: char) -> Result<bool, GuessError> {
        let letter = plain(letter);
        if self.word.is_none() || self.status() != ShabdaStatus::Playing {
            return Err(GuessError::Finished);
        }
        if !is_key(letter) {
            return Err(GuessError::NotALetter);
        }
        if self.guessed.contains(&letter) {
            return Err(GuessError::AlreadyGuessed);
        }
        self.guessed.push(letter);
        self.settle();
        Ok(self.has(letter))
    }

    /// Shows the first hidden akshar, for a life. Never the last one hidden,
    /// and never the life that would lose the word. Returns its place.
    pub fn hint(&mut self) -> Result<usize, HintError> {
        if self.word.is_none() || self.status() != ShabdaStatus::Playing {
            return Err(HintError::Finished);
        }
        let shown = self.shown();
        let hidden = shown.iter().filter(|s| !**s).count();
        if hidden <= 1 || self.wrong() + 1 >= MAX_WRONG {
            return Err(HintError::NoneLeft);
        }
        let place = shown.iter().position(|s| !s).ok_or(HintError::NoneLeft)?;
        let akshar = self.aksharas()[place].clone();
        for letter in letters_in(&akshar) {
            if !self.guessed.contains(&letter) {
                self.guessed.push(letter);
            }
        }
        self.hints += 1;
        self.settle();
        Ok(place)
    }

    /// Whether another hint may be taken now.
    pub fn hint_left(&self) -> bool {
        self.status() == ShabdaStatus::Playing
            && self.shown().iter().filter(|s| !**s).count() > 1
            && self.wrong() + 1 < MAX_WRONG
    }

    /// Records the word once it is over.
    fn settle(&mut self) {
        let status = self.status();
        if status != ShabdaStatus::Playing {
            self.record(status);
        }
    }

    fn record(&mut self, status: ShabdaStatus) {
        let stats = &mut self.stats;
        stats.played += 1;
        if status == ShabdaStatus::Won {
            stats.won += 1;
            stats.run += 1;
            stats.best_run = stats.best_run.max(stats.run);
        } else {
            stats.run = 0;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn playing(word: &str) -> ShabdaState {
        let mut state = ShabdaState::default();
        state.next(&[word.to_owned()], 0);
        state
    }

    #[test]
    fn aksharas_count_as_a_reader_does() {
        assert_eq!(aksharas("कलम").unwrap(), ["क", "ल", "म"]);
        assert_eq!(aksharas("किताब").unwrap(), ["कि", "ता", "ब"]);
        assert_eq!(aksharas("पुस्तक").unwrap(), ["पु", "स्त", "क"]);
        assert_eq!(aksharas("इज्जत").unwrap(), ["इ", "ज्ज", "त"]);
        assert!(aksharas("kalam").is_none());
    }

    #[test]
    fn a_joined_letter_needs_each_of_its_letters() {
        assert_eq!(letters_in("स्पा"), ['स', 'प']);
        assert_eq!(letters_in("\u{095C}ि"), ['ड']);
        assert_eq!(letters_in("ड\u{093C}ि"), ['ड']);
        let mut state = playing("नास्पाती");
        state.guess('स').unwrap();
        assert_eq!(state.shown(), [false, false, false]);
        state.guess('प').unwrap();
        assert_eq!(state.shown(), [false, true, false]);
    }

    #[test]
    fn one_letter_fills_every_place_it_is_in() {
        let mut state = playing("कमल");
        assert_eq!(state.guess('क'), Ok(true));
        assert_eq!(state.shown(), [true, false, false]);
        assert_eq!(state.guess('ख'), Ok(false));
        assert_eq!(state.wrong(), 1);
        assert_eq!(state.guess('ख'), Err(GuessError::AlreadyGuessed));
        assert_eq!(state.guess('a'), Err(GuessError::NotALetter));
        state.guess('म').unwrap();
        state.guess('ल').unwrap();
        assert_eq!(state.status(), ShabdaStatus::Won);
        assert_eq!((state.stats.won, state.stats.run), (1, 1));
        assert_eq!(state.guess('त'), Err(GuessError::Finished));
    }

    #[test]
    fn six_wrong_letters_lose_the_word_and_the_run() {
        let mut state = playing("कमल");
        state.stats.run = 4;
        for letter in ['ख', 'ग', 'घ', 'च', 'छ', 'ज'] {
            state.guess(letter).unwrap();
        }
        assert_eq!(state.status(), ShabdaStatus::Lost);
        assert_eq!((state.stats.played, state.stats.run), (1, 0));
    }

    #[test]
    fn a_hint_costs_a_life_and_keeps_the_last_letter_back() {
        let mut state = playing("कमल");
        assert_eq!(state.hint(), Ok(0));
        assert_eq!(state.wrong(), 1);
        assert_eq!(state.hint(), Ok(1));
        assert_eq!(state.hint(), Err(HintError::NoneLeft));
        assert!(!state.hint_left());
    }

    #[test]
    fn words_do_not_repeat_until_all_are_played() {
        let words: Vec<String> = ["कमल", "कलम", "महल"].map(str::to_owned).to_vec();
        let mut state = ShabdaState::default();
        let mut played = BTreeSet::new();
        for seed in 0..3 {
            state.next(&words, seed);
            played.insert(state.word.clone().unwrap());
        }
        assert_eq!(played.len(), 3);
        let last = state.word.clone();
        state.next(&words, 0);
        assert_ne!(
            state.word, last,
            "a new round doesn't start with the same word"
        );
    }

    #[test]
    fn leaving_a_word_unfinished_counts_as_a_loss() {
        let words: Vec<String> = ["कमल", "कलम"].map(str::to_owned).to_vec();
        let mut state = ShabdaState::default();
        state.next(&words, 0);
        state.stats.run = 2;
        state.next(&words, 0);
        assert_eq!((state.stats.played, state.stats.run), (1, 0));
    }
}
