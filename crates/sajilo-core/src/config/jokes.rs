//! The jokes a break card says, as data: `data/config/jokes.json`.

use std::collections::{BTreeMap, BTreeSet};

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use super::{Pack, Slot};
use crate::focus::jokes::{EDITABLE, Joke, MAX_LINE, MIN_DECK, deck_name};

/// The parts of Sajilo a tip may point to. The app owns where each one leads
/// and when it may be suggested; a pack only words the suggestion.
pub const TIP_FEATURES: [&str; 18] = [
    "games",
    "radio",
    "notes",
    "rashifal",
    "weather",
    "jobs",
    "bills",
    "documents",
    "tools",
    "converter",
    "newsAlerts",
    "clocks",
    "stocks",
    "gold",
    "panchang",
    "crypto",
    "shares",
    "typing",
];
/// Enough to rotate through for a month without a pack growing into a feed.
const MAX_TIPS: usize = 40;

/// One quiet line a break card may add about a part of Sajilo the user has
/// not opened yet.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Tip {
    /// One of [`TIP_FEATURES`].
    pub feature: String,
    pub en: String,
    pub ne: String,
    /// The first day it may show, in Nepal; none means from now.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<NaiveDate>,
    /// The last day it may show, in Nepal; none means no end.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub until: Option<NaiveDate>,
}

impl Tip {
    /// Whether `day` falls inside the tip's dates.
    pub fn runs_on(&self, day: NaiveDate) -> bool {
        self.from.is_none_or(|from| from <= day) && self.until.is_none_or(|until| day <= until)
    }

    /// Whether it was given dates: a promotion for a season rather than a
    /// standing suggestion.
    pub fn is_dated(&self) -> bool {
        self.from.is_some() || self.until.is_some()
    }
}

/// The done decks a break kind can have of its own; `any` fits every break.
pub const DONE_DECKS: [&str; 4] = ["eyes", "move", "water", "any"];

/// Nepali runs longer than English for the same joke; this is the room a
/// line gets in either language before the card wraps a third time.
const MAX_NE_LINE: usize = MAX_LINE * 2;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct JokesPack {
    /// Each editable deck's lines, by [`deck_name`].
    pub decks: BTreeMap<String, Vec<Joke>>,
    /// The lines a card may say once its break is taken, by [`DONE_DECKS`].
    pub done: BTreeMap<String, Vec<Joke>>,
    /// Lines about other parts of Sajilo, for break cards. Absent from packs
    /// published before tips existed, which older apps still read.
    #[serde(default)]
    pub tips: Vec<Tip>,
}

impl JokesPack {
    pub fn deck(&self, name: &str) -> &[Joke] {
        self.decks.get(name).map_or(&[], Vec::as_slice)
    }

    pub fn done(&self, name: &str) -> &[Joke] {
        self.done.get(name).map_or(&[], Vec::as_slice)
    }
}

fn check_lines(field: &str, lines: &[Joke]) -> Result<(), String> {
    let mut seen = BTreeSet::new();
    for (index, joke) in lines.iter().enumerate() {
        super::check::text(&format!("{field}[{index}].en"), &joke.en, MAX_LINE)?;
        super::check::text(&format!("{field}[{index}].ne"), &joke.ne, MAX_NE_LINE)?;
        // Built-in lines are named by their English text in the user's edits.
        if !seen.insert(joke.en.as_str()) {
            return Err(format!("{field} has \"{}\" twice", joke.en));
        }
    }
    Ok(())
}

impl Pack for JokesPack {
    const NAME: &'static str = "jokes";
    const SCHEMA: u32 = 1;

    fn bundled_json() -> &'static str {
        include_str!("../../../../data/config/jokes.json")
    }

    fn validate(&self) -> Result<(), String> {
        let expected: BTreeSet<&str> = EDITABLE.iter().map(|kind| deck_name(*kind)).collect();
        let got: BTreeSet<&str> = self.decks.keys().map(String::as_str).collect();
        if expected != got {
            return Err(format!("decks must be exactly {expected:?}, got {got:?}"));
        }
        for (name, lines) in &self.decks {
            if lines.len() < MIN_DECK {
                return Err(format!("decks.{name} has fewer than {MIN_DECK} lines"));
            }
            check_lines(&format!("decks.{name}"), lines)?;
        }
        for name in self.done.keys() {
            if !DONE_DECKS.contains(&name.as_str()) {
                return Err(format!("done.{name} is not one of {DONE_DECKS:?}"));
            }
        }
        if self.done("any").len() < MIN_DECK {
            return Err(format!("done.any has fewer than {MIN_DECK} lines"));
        }
        for (name, lines) in &self.done {
            check_lines(&format!("done.{name}"), lines)?;
        }
        if self.tips.len() > MAX_TIPS {
            return Err(format!("tips has more than {MAX_TIPS} lines"));
        }
        for (index, tip) in self.tips.iter().enumerate() {
            if !TIP_FEATURES.contains(&tip.feature.as_str()) {
                return Err(format!(
                    "tips[{index}].feature {} is not one of {TIP_FEATURES:?}",
                    tip.feature
                ));
            }
            super::check::text(&format!("tips[{index}].en"), &tip.en, MAX_LINE)?;
            super::check::text(&format!("tips[{index}].ne"), &tip.ne, MAX_NE_LINE)?;
            if let (Some(from), Some(until)) = (tip.from, tip.until)
                && until < from
            {
                return Err(format!("tips[{index}].until is before its from"));
            }
        }
        Ok(())
    }

    fn slot() -> &'static Slot<Self> {
        static SLOT: Slot<JokesPack> = Slot::new();
        &SLOT
    }
}
