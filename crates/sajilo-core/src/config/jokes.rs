//! The jokes a break card says, as data: `data/config/jokes.json`.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use super::{Pack, Slot};
use crate::focus::jokes::{EDITABLE, Joke, MAX_LINE, MIN_DECK, deck_name};

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
        Ok(())
    }

    fn slot() -> &'static Slot<Self> {
        static SLOT: Slot<JokesPack> = Slot::new();
        &SLOT
    }
}
