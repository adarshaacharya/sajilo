//! A short quiz: ten questions a round, from the quiz pack. Every question
//! answered is remembered, so none comes back until the player has seen all
//! of them (in that topic); then the round starts the list over.
//!
//! "All topics" takes turns between topics rather than drawing at random,
//! so the hundreds of district questions don't crowd out the rest. The order
//! of each question's options is shuffled per round, so a remembered
//! position is no help.
//!
//! The same state can serve a question of the day elsewhere later: anything
//! answered there joins `seen` just the same.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::config::quiz::{OPTIONS, QuizCategory, QuizPack};

/// Questions in a round: two or three minutes.
pub const ROUND: usize = 10;

/// A small deterministic generator: rounds are random to the player, and
/// repeatable in tests from the same seed.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        // SplitMix64.
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }

    fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            items.swap(i, self.below(i + 1));
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct QuizStats {
    pub rounds: u32,
    pub answered: u32,
    pub correct: u32,
    /// The most right in one round.
    pub best_round: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Round {
    /// `None` for all topics.
    pub category: Option<QuizCategory>,
    pub ids: Vec<String>,
    /// For each question, the order its options are shown in: `order[i]` is
    /// the pack's option shown at place `i`.
    pub orders: Vec<[u8; OPTIONS]>,
    /// The place chosen for each question answered so far.
    pub chosen: Vec<u8>,
    /// Whether the last answer is still being shown, before Next.
    pub revealing: bool,
}

impl Round {
    pub fn finished(&self) -> bool {
        self.chosen.len() >= self.ids.len() && !self.revealing
    }

    /// Which question is on screen: the one just answered while it is being
    /// shown, otherwise the next unanswered.
    pub fn current(&self) -> Option<usize> {
        if self.finished() {
            None
        } else if self.revealing {
            self.chosen.len().checked_sub(1)
        } else {
            Some(self.chosen.len())
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct QuizState {
    pub seen: BTreeSet<String>,
    pub round: Option<Round>,
    pub stats: QuizStats,
    /// Today's question of the day, asked on a card outside the game.
    pub daily: Option<Daily>,
}

/// One question for one day: the same all day, answered once.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Daily {
    /// Days since 1 Jan 1970, so a new day is a new question.
    pub day: i64,
    pub id: String,
    pub order: [u8; OPTIONS],
    /// The place chosen, once answered.
    pub chosen: Option<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnswerError {
    NoRound,
    AlreadyAnswered,
    OutOfRange,
}

impl QuizState {
    /// Starts a round of up to [`ROUND`] questions not yet seen. When the
    /// topic runs out, its questions are forgotten and come round again.
    pub fn start(&mut self, pack: &QuizPack, category: Option<QuizCategory>, seed: u64) {
        let mut rng = Rng(seed);
        let in_topic =
            |q: &&crate::config::quiz::Question| category.is_none_or(|wanted| q.category == wanted);
        let unseen = |seen: &BTreeSet<String>| {
            pack.questions
                .iter()
                .filter(in_topic)
                .filter(|q| !seen.contains(&q.id))
                .count()
        };
        // What is left of the topic goes first, before it starts over.
        let leftover: Vec<String> = pack
            .questions
            .iter()
            .filter(in_topic)
            .filter(|q| !self.seen.contains(&q.id))
            .map(|q| q.id.clone())
            .collect();
        let restart = unseen(&self.seen) < ROUND;
        if restart {
            let topic: BTreeSet<&str> = pack
                .questions
                .iter()
                .filter(in_topic)
                .map(|q| q.id.as_str())
                .collect();
            self.seen.retain(|id| !topic.contains(id.as_str()));
        }

        // Unseen questions by topic, each list shuffled.
        let mut by_topic: BTreeMap<QuizCategory, Vec<&str>> = BTreeMap::new();
        for question in pack
            .questions
            .iter()
            .filter(in_topic)
            .filter(|q| !self.seen.contains(&q.id))
        {
            by_topic
                .entry(question.category)
                .or_default()
                .push(&question.id);
        }
        let mut topics: Vec<QuizCategory> = by_topic.keys().copied().collect();
        for list in by_topic.values_mut() {
            rng.shuffle(list);
        }
        rng.shuffle(&mut topics);

        // Turns between topics until the round is full.
        let mut ids: Vec<String> = if restart { leftover } else { Vec::new() };
        for list in by_topic.values_mut() {
            list.retain(|id| !ids.iter().any(|kept| kept == id));
        }
        while ids.len() < ROUND && by_topic.values().any(|list| !list.is_empty()) {
            for topic in &topics {
                if ids.len() >= ROUND {
                    break;
                }
                if let Some(id) = by_topic.get_mut(topic).and_then(Vec::pop) {
                    ids.push(id.to_owned());
                }
            }
        }
        let orders = ids
            .iter()
            .map(|_| {
                let mut order = [0, 1, 2, 3];
                rng.shuffle(&mut order);
                order
            })
            .collect();
        self.round = Some(Round {
            category,
            ids,
            orders,
            chosen: Vec::new(),
            revealing: false,
        });
    }

    /// Answers the question on screen with the option shown at `place`.
    /// Returns whether it was right.
    pub fn answer(&mut self, pack: &QuizPack, place: u8) -> Result<bool, AnswerError> {
        let round = self.round.as_mut().ok_or(AnswerError::NoRound)?;
        if round.revealing {
            return Err(AnswerError::AlreadyAnswered);
        }
        let index = round.chosen.len();
        let (Some(id), Some(order)) = (round.ids.get(index), round.orders.get(index)) else {
            return Err(AnswerError::NoRound);
        };
        let picked = *order
            .get(usize::from(place))
            .ok_or(AnswerError::OutOfRange)?;
        let right = pack
            .questions
            .iter()
            .find(|q| &q.id == id)
            .is_some_and(|q| q.answer == picked);
        self.seen.insert(id.clone());
        round.chosen.push(place);
        round.revealing = true;
        self.stats.answered += 1;
        if right {
            self.stats.correct += 1;
        }
        Ok(right)
    }

    /// Moves past the answer being shown; at the end, counts the round.
    pub fn next(&mut self, pack: &QuizPack) {
        let Some(round) = self.round.as_mut() else {
            return;
        };
        round.revealing = false;
        if round.finished() {
            let score = score(round, pack);
            self.stats.rounds += 1;
            self.stats.best_round = self.stats.best_round.max(score);
        }
    }
}

impl QuizState {
    /// The question of the day for `day`: one not seen yet when there is
    /// one, the same all day. Picking it does not mark it seen; answering
    /// does, as in a round.
    pub fn daily(&mut self, pack: &QuizPack, day: i64) -> Option<&Daily> {
        if self.daily.as_ref().is_none_or(|daily| daily.day != day) {
            let mut rng = Rng((day as u64).wrapping_mul(0x9E37_79B9));
            let mut pool: Vec<&str> = pack
                .questions
                .iter()
                .filter(|q| !self.seen.contains(&q.id))
                .map(|q| q.id.as_str())
                .collect();
            if pool.is_empty() {
                pool = pack.questions.iter().map(|q| q.id.as_str()).collect();
            }
            let id = (*pool.get(rng.below(pool.len().max(1)))?).to_owned();
            let mut order = [0, 1, 2, 3];
            rng.shuffle(&mut order);
            self.daily = Some(Daily {
                day,
                id,
                order,
                chosen: None,
            });
        }
        self.daily.as_ref()
    }

    /// Answers today's question with the option shown at `place`, once.
    pub fn answer_daily(&mut self, pack: &QuizPack, place: u8) -> Result<bool, AnswerError> {
        let daily = self.daily.as_mut().ok_or(AnswerError::NoRound)?;
        if daily.chosen.is_some() {
            return Err(AnswerError::AlreadyAnswered);
        }
        let picked = *daily
            .order
            .get(usize::from(place))
            .ok_or(AnswerError::OutOfRange)?;
        let right = pack
            .questions
            .iter()
            .find(|q| q.id == daily.id)
            .is_some_and(|q| q.answer == picked);
        daily.chosen = Some(place);
        self.seen.insert(daily.id.clone());
        self.stats.answered += 1;
        if right {
            self.stats.correct += 1;
        }
        Ok(right)
    }
}

/// Right answers so far in `round`.
pub fn score(round: &Round, pack: &QuizPack) -> u32 {
    round
        .chosen
        .iter()
        .enumerate()
        .filter(|(index, place)| {
            let (Some(id), Some(order)) = (round.ids.get(*index), round.orders.get(*index)) else {
                return false;
            };
            pack.questions
                .iter()
                .find(|q| &q.id == id)
                .is_some_and(|q| order.get(usize::from(**place)) == Some(&q.answer))
        })
        .count() as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Pack;

    fn pack() -> QuizPack {
        serde_json::from_str(QuizPack::bundled_json()).unwrap()
    }

    /// The place the right answer is shown at, for the question on screen.
    fn right_place(state: &QuizState, pack: &QuizPack) -> u8 {
        let round = state.round.as_ref().unwrap();
        let index = round.current().unwrap();
        let question = pack
            .questions
            .iter()
            .find(|q| q.id == round.ids[index])
            .unwrap();
        round.orders[index]
            .iter()
            .position(|o| *o == question.answer)
            .unwrap() as u8
    }

    #[test]
    fn a_round_is_ten_questions_and_counts_right_answers() {
        let pack = pack();
        let mut state = QuizState::default();
        state.start(&pack, None, 7);
        for turn in 0..ROUND {
            let place = if turn < 7 {
                right_place(&state, &pack)
            } else {
                (right_place(&state, &pack) + 1) % 4
            };
            assert_eq!(state.answer(&pack, place).unwrap(), turn < 7);
            assert_eq!(
                state.answer(&pack, 0),
                Err(AnswerError::AlreadyAnswered),
                "one answer per question"
            );
            state.next(&pack);
        }
        let round = state.round.as_ref().unwrap();
        assert!(round.finished());
        assert_eq!(score(round, &pack), 7);
        assert_eq!(state.stats.rounds, 1);
        assert_eq!(state.stats.best_round, 7);
        assert_eq!(state.seen.len(), ROUND);
    }

    #[test]
    fn no_question_repeats_until_the_topic_is_used_up() {
        let pack = pack();
        let units = pack
            .questions
            .iter()
            .filter(|q| q.category == QuizCategory::Units)
            .count();
        let mut state = QuizState::default();
        let mut asked = Vec::new();
        for seed in 0..3 {
            state.start(&pack, Some(QuizCategory::Units), seed);
            while let Some(index) = state.round.as_ref().unwrap().current() {
                asked.push(state.round.as_ref().unwrap().ids[index].clone());
                state.answer(&pack, 0).unwrap();
                state.next(&pack);
            }
        }
        let first: BTreeSet<_> = asked.iter().take(units).collect();
        assert_eq!(
            first.len(),
            units,
            "every unit question once before any again"
        );
    }

    #[test]
    fn all_topics_take_turns() {
        let pack = pack();
        let mut state = QuizState::default();
        state.start(&pack, None, 3);
        let topics: BTreeSet<QuizCategory> = state
            .round
            .unwrap()
            .ids
            .iter()
            .map(|id| {
                pack.questions
                    .iter()
                    .find(|q| &q.id == id)
                    .unwrap()
                    .category
            })
            .collect();
        assert_eq!(topics.len(), QuizCategory::ALL.len());
    }

    #[test]
    fn options_are_shuffled_but_the_answer_follows() {
        let pack = pack();
        let mut state = QuizState::default();
        state.start(&pack, None, 11);
        let orders = &state.round.as_ref().unwrap().orders;
        assert!(orders.iter().any(|order| *order != [0, 1, 2, 3]));
        for order in orders {
            let mut sorted = *order;
            sorted.sort_unstable();
            assert_eq!(sorted, [0, 1, 2, 3]);
        }
    }

    #[test]
    fn a_question_a_day_answered_once_and_then_seen() {
        let pack = pack();
        let mut state = QuizState::default();
        let first = state.daily(&pack, 20_000).unwrap().id.clone();
        assert_eq!(
            state.daily(&pack, 20_000).unwrap().id,
            first,
            "the same all day"
        );
        state.answer_daily(&pack, 0).unwrap();
        assert_eq!(
            state.answer_daily(&pack, 1),
            Err(AnswerError::AlreadyAnswered)
        );
        assert!(state.seen.contains(&first));
        assert_eq!(state.stats.answered, 1);
        let next = state.daily(&pack, 20_001).unwrap();
        assert_ne!(next.id, first, "a new day asks something not yet seen");
        assert_eq!(next.chosen, None);
    }
}
