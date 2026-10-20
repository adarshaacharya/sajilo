//! The quiz's questions: `data/config/quiz.json`.
//!
//! Multiple choice, four options, in English and Nepali. Kept as a pack so
//! questions are added, fixed and retired without a release; a question's
//! `id` is how a player's progress remembers it, so it never changes once
//! published.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use super::check::text;
use super::{Pack, Slot};

const MAX_QUESTIONS: usize = 10_000;
const MIN_QUESTIONS: usize = 50;
const MAX_ID: usize = 80;
const MAX_QUESTION: usize = 240;
const MAX_OPTION: usize = 120;
pub const OPTIONS: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub enum QuizCategory {
    /// Nepal general knowledge: symbols, history, people, culture.
    Nepal,
    /// Districts, headquarters, provinces, places.
    Geography,
    /// The constitution, parliament, local levels, commissions.
    Civics,
    /// Bikram Sambat months and national days.
    Calendar,
    /// Ropani, tola, lakh: Nepali measures and numbers.
    Units,
}

impl QuizCategory {
    pub const ALL: [Self; 5] = [
        Self::Nepal,
        Self::Civics,
        Self::Geography,
        Self::Calendar,
        Self::Units,
    ];
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Localized {
    pub q: String,
    /// Exactly [`OPTIONS`], the right one at the question's `answer`.
    pub options: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Question {
    /// Lower-case letters, digits and dashes; never reused for another
    /// question, since progress is kept by it.
    pub id: String,
    pub category: QuizCategory,
    pub en: Localized,
    pub ne: Localized,
    /// Which option is right, from 0. Options are shuffled when shown.
    pub answer: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuizPack {
    pub questions: Vec<Question>,
}

fn options(field: &str, localized: &Localized) -> Result<(), String> {
    text(&format!("{field}.q"), &localized.q, MAX_QUESTION)?;
    if localized.options.len() != OPTIONS {
        return Err(format!("{field}.options must have {OPTIONS}"));
    }
    let mut seen = BTreeSet::new();
    for (index, option) in localized.options.iter().enumerate() {
        text(&format!("{field}.options[{index}]"), option, MAX_OPTION)?;
        if !seen.insert(option.as_str()) {
            return Err(format!("{field}.options has \"{option}\" twice"));
        }
    }
    Ok(())
}

impl Pack for QuizPack {
    const NAME: &'static str = "quiz";
    const SCHEMA: u32 = 1;

    fn bundled_json() -> &'static str {
        include_str!("../../../../data/config/quiz.json")
    }

    fn validate(&self) -> Result<(), String> {
        if !(MIN_QUESTIONS..=MAX_QUESTIONS).contains(&self.questions.len()) {
            return Err(format!(
                "between {MIN_QUESTIONS} and {MAX_QUESTIONS} questions"
            ));
        }
        let mut ids = BTreeSet::new();
        for (index, question) in self.questions.iter().enumerate() {
            let field = format!("questions[{index}]");
            let id = &question.id;
            if id.is_empty()
                || id.len() > MAX_ID
                || !id
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
            {
                return Err(format!("{field}.id \"{id}\" is not a slug"));
            }
            if !ids.insert(id.as_str()) {
                return Err(format!("questions has id \"{id}\" twice"));
            }
            options(&format!("{field}.en"), &question.en)?;
            options(&format!("{field}.ne"), &question.ne)?;
            if usize::from(question.answer) >= OPTIONS {
                return Err(format!("{field}.answer must be below {OPTIONS}"));
            }
        }
        Ok(())
    }

    fn slot() -> &'static Slot<Self> {
        static SLOT: Slot<QuizPack> = Slot::new();
        &SLOT
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bundled() -> QuizPack {
        serde_json::from_str(QuizPack::bundled_json()).unwrap()
    }

    #[test]
    fn the_bundled_questions_are_valid() {
        bundled().validate().unwrap();
    }

    #[test]
    fn every_category_has_questions() {
        let pack = bundled();
        for category in QuizCategory::ALL {
            assert!(
                pack.questions.iter().any(|q| q.category == category),
                "{category:?}"
            );
        }
    }

    #[test]
    fn bad_questions_are_refused() {
        let mut pack = bundled();
        pack.questions[1].id = pack.questions[0].id.clone();
        assert!(pack.validate().unwrap_err().contains("twice"));

        let mut pack = bundled();
        pack.questions[0].en.options.pop();
        assert!(pack.validate().unwrap_err().contains("must have 4"));

        let mut pack = bundled();
        pack.questions[0].answer = 4;
        assert!(pack.validate().unwrap_err().contains("answer"));
    }
}
