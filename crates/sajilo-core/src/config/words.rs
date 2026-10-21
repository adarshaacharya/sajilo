//! The word game's words: `data/config/words.json`.
//!
//! Each is found letter by letter from its clue, a meaning in a few words.
//! Kept as a pack so a misspelt word is fixed, and the list grows, without a
//! release.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use super::{Pack, Slot};
use crate::games::shabda::{LENGTH, aksharas, is_key, letters_in};

const MAX_WORDS: usize = 5000;
/// Enough for a few months without a repeat.
const MIN_WORDS: usize = 100;
const MAX_CLUE: usize = 80;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WordsPack {
    /// Common words of exactly [`LENGTH`] letters (aksharas), in the order
    /// they are played.
    pub answers: Vec<String>,
    /// Each answer's clue. Added after the first release, so an app that
    /// predates it reads the pack without them.
    #[serde(default)]
    pub clues: BTreeMap<String, Clue>,
}

/// A word's clue in each language. It never says the word itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Clue {
    pub en: String,
    pub ne: String,
}

impl WordsPack {
    /// `word`'s clue in the reader's language.
    pub fn clue(&self, word: &str, nepali: bool) -> Option<&str> {
        let clue = self.clues.get(word)?;
        Some(if nepali { &clue.ne } else { &clue.en })
    }
}

impl Pack for WordsPack {
    const NAME: &'static str = "words";
    const SCHEMA: u32 = 1;

    fn bundled_json() -> &'static str {
        include_str!("../../../../data/config/words.json")
    }

    fn validate(&self) -> Result<(), String> {
        if !(MIN_WORDS..=MAX_WORDS).contains(&self.answers.len()) {
            return Err(format!("between {MIN_WORDS} and {MAX_WORDS} answers"));
        }
        let mut seen = BTreeSet::new();
        for (index, word) in self.answers.iter().enumerate() {
            let letters = aksharas(word)
                .ok_or_else(|| format!("answers[{index}] \"{word}\" is not Devanagari"))?;
            if letters.len() != LENGTH {
                return Err(format!(
                    "answers[{index}] \"{word}\" has {} letters, not {LENGTH}",
                    letters.len()
                ));
            }
            if let Some(odd) = letters
                .iter()
                .flat_map(|akshar| letters_in(akshar))
                .find(|letter| !is_key(*letter))
            {
                return Err(format!(
                    "answers[{index}] \"{word}\" has {odd}, which isn't on the letter pad"
                ));
            }
            if !seen.insert(word.as_str()) {
                return Err(format!("answers has \"{word}\" twice"));
            }
            let clue = self
                .clues
                .get(word)
                .ok_or_else(|| format!("answers[{index}] \"{word}\" has no clue"))?;
            for text in [&clue.en, &clue.ne] {
                if text.trim().is_empty() || text.chars().count() > MAX_CLUE {
                    return Err(format!(
                        "clues[\"{word}\"] must be 1 to {MAX_CLUE} characters"
                    ));
                }
                if text.contains(word.as_str()) {
                    return Err(format!("clues[\"{word}\"] gives the word away"));
                }
            }
        }
        if let Some(stray) = self.clues.keys().find(|word| !seen.contains(word.as_str())) {
            return Err(format!("clues has \"{stray}\", which is not an answer"));
        }
        Ok(())
    }

    fn slot() -> &'static Slot<Self> {
        static SLOT: Slot<WordsPack> = Slot::new();
        &SLOT
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_bundled_words_are_valid() {
        let pack: WordsPack = serde_json::from_str(WordsPack::bundled_json()).unwrap();
        pack.validate().unwrap();
    }

    #[test]
    fn a_word_of_the_wrong_length_is_refused() {
        let mut pack: WordsPack = serde_json::from_str(WordsPack::bundled_json()).unwrap();
        pack.answers[0] = "पानी".to_owned();
        assert!(pack.validate().unwrap_err().contains("2 letters"));
    }

    #[test]
    fn every_word_needs_a_clue_that_keeps_it_secret() {
        let mut pack: WordsPack = serde_json::from_str(WordsPack::bundled_json()).unwrap();
        let word = pack.answers[0].clone();
        pack.clues.get_mut(&word).unwrap().ne = format!("{word} हो");
        assert!(pack.validate().unwrap_err().contains("gives the word away"));
        pack.clues.remove(&word);
        assert!(pack.validate().unwrap_err().contains("has no clue"));
    }

    #[test]
    fn a_pack_from_before_clues_still_reads() {
        let pack: WordsPack = serde_json::from_str(r#"{"answers":["कलम"]}"#).unwrap();
        assert!(pack.clues.is_empty());
        assert_eq!(pack.clue("कलम", true), None);
    }
}
