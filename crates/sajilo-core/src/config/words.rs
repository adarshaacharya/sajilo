//! The daily word puzzle's answers: `data/config/words.json`.
//!
//! One word a day, in the order listed, the same for everyone. Kept as a pack
//! so a misspelt word is fixed, and the list grows, without a release.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use super::{Pack, Slot};
use crate::games::shabda::{LENGTH, aksharas};

const MAX_WORDS: usize = 5000;
/// Enough for a few months without a repeat.
const MIN_WORDS: usize = 100;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WordsPack {
    /// Common words of exactly [`LENGTH`] letters (aksharas), in the order
    /// they are played.
    pub answers: Vec<String>,
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
            if !seen.insert(word.as_str()) {
                return Err(format!("answers has \"{word}\" twice"));
            }
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
}
