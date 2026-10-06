//! The lines a break card or notification says instead of the plain
//! instruction, when jokes are on.
//!
//! Each kind of break has its own deck, dealt in a shuffled order: every line
//! comes up once before any comes up again, the order changes each round, and
//! a round never opens with the line that closed the one before. Where the
//! deal has got to is kept in [`super::FocusState`], so a restart does not
//! start the deck over.
//!
//! The lines themselves are data — `data/config/jokes.json`, bundled and
//! replaceable at runtime through [`crate::config::jokes::JokesPack`].

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use super::{BreakKind, Language};
use crate::config::Pack;
use crate::config::jokes::JokesPack;

/// A deck needs at least this many lines for the no-repeat rule to hold
/// across rounds; a test keeps every deck above it.
pub const MIN_DECK: usize = 3;

/// The longest a line may run. A joke that needs more than two lines on
/// the card is explaining itself.
pub const MAX_LINE: usize = 90;

/// A dealt joke, carried on a card in both languages so it can be shown in
/// whichever one the app is set to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Joke {
    pub en: String,
    pub ne: String,
}

impl Joke {
    pub fn new(en: &str, ne: &str) -> Self {
        Self {
            en: en.to_owned(),
            ne: ne.to_owned(),
        }
    }

    /// Either language standing in for the other where it is empty.
    fn filled(mut self) -> Self {
        if self.en.is_empty() {
            self.en.clone_from(&self.ne);
        } else if self.ne.is_empty() {
            self.ne.clone_from(&self.en);
        }
        self
    }

    pub fn text(&self, language: Language) -> &str {
        match language {
            Language::En => &self.en,
            Language::Ne => &self.ne,
        }
    }
}

/// Fewest lines a deck the user edits may keep switched on, so their card
/// still rotates rather than saying one line over and over.
pub const MIN_LINES: usize = 5;

/// Longest line of the user's own; a little more room than ours.
pub const MAX_OWN_LINE: usize = 120;

/// The decks the user can edit, in the order the editor lists them.
pub const EDITABLE: [BreakKind; 8] = [
    BreakKind::Eyes,
    BreakKind::Move,
    BreakKind::Water,
    BreakKind::Breakfast,
    BreakKind::Lunch,
    BreakKind::Dinner,
    BreakKind::Bedtime,
    BreakKind::EndOfDay,
];

/// The user's changes to one deck. Sajilo's lines stay built in and are
/// named by their English text, so an update that adds lines keeps every
/// edit, and a line reworded in an update simply drops its old edit.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DeckEdits {
    /// Sajilo's lines switched off.
    pub off: BTreeSet<String>,
    /// Sajilo's lines in the user's words.
    pub edited: BTreeMap<String, Joke>,
    /// The user's own lines. Either language may be left empty.
    pub added: Vec<Joke>,
}

/// Every deck's edits, by [`deck_name`].
pub type JokeEdits = BTreeMap<String, DeckEdits>;

/// The lines `kind`'s card deals from: Sajilo's, as the user edited them,
/// then the user's own. A line written in one language only is said in that
/// one in both. Should edits leave fewer than [`MIN_LINES`] on (only a
/// hand-edited file could), the switched-off lines come back.
pub fn deck(kind: BreakKind, edits: &JokeEdits) -> Vec<Joke> {
    let built_in = lines(kind);
    let Some(deck_edits) = edits.get(deck_name(kind)) else {
        return built_in;
    };
    let build = |honour_off: bool| -> Vec<Joke> {
        built_in
            .iter()
            .filter(|joke| !(honour_off && deck_edits.off.contains(&joke.en)))
            .map(|joke| {
                deck_edits
                    .edited
                    .get(&joke.en)
                    .cloned()
                    .unwrap_or_else(|| joke.clone())
            })
            .chain(deck_edits.added.iter().cloned())
            .map(Joke::filled)
            .filter(|joke| !joke.en.is_empty())
            .collect()
    };
    let deck = build(true);
    if deck.len() >= MIN_LINES {
        deck
    } else {
        build(false)
    }
}

/// Tidies stored edits: trims and shortens lines, drops empty ones, edits of
/// lines neither this build nor the installed pack has, edits that match the
/// original, and decks nobody can edit.
///
/// A line counts as known if either the bundled or the installed jokes have
/// it, so a remote pack that briefly lacks a line never deletes the user's
/// edit of it.
pub fn normalise(edits: &mut JokeEdits) {
    let tidy = |text: &str| text.trim().chars().take(MAX_OWN_LINE).collect::<String>();
    edits.retain(|name, deck_edits| {
        let Some(kind) = EDITABLE.iter().find(|kind| deck_name(**kind) == name) else {
            return false;
        };
        let name = deck_name(*kind);
        let (bundled, active) = (JokesPack::bundled(), JokesPack::active());
        let known: BTreeMap<&str, &str> = bundled
            .deck(name)
            .iter()
            .chain(active.deck(name))
            .map(|joke| (joke.en.as_str(), joke.ne.as_str()))
            .collect();
        deck_edits.off.retain(|en| known.contains_key(en.as_str()));
        deck_edits.edited.retain(|en, joke| {
            joke.en = tidy(&joke.en);
            joke.ne = tidy(&joke.ne);
            known.get(en.as_str()).is_some_and(|ne| {
                (joke.en.as_str(), joke.ne.as_str()) != (en.as_str(), *ne)
                    && !(joke.en.is_empty() && joke.ne.is_empty())
            })
        });
        for joke in &mut deck_edits.added {
            joke.en = tidy(&joke.en);
            joke.ne = tidy(&joke.ne);
        }
        deck_edits
            .added
            .retain(|joke| !(joke.en.is_empty() && joke.ne.is_empty()));
        *deck_edits != DeckEdits::default()
    });
}

/// Sajilo's lines for `kind`, from the active jokes pack. The user's own
/// reminder is their words, not ours, so it has none.
pub fn lines(kind: BreakKind) -> Vec<Joke> {
    if kind == BreakKind::Custom {
        return Vec::new();
    }
    JokesPack::active().deck(deck_name(kind)).to_vec()
}

/// The deck name a kind's deal is remembered under.
pub fn deck_name(kind: BreakKind) -> &'static str {
    match kind {
        BreakKind::Eyes => "eyes",
        BreakKind::Move => "move",
        BreakKind::Water => "water",
        BreakKind::EndOfDay => "endOfDay",
        BreakKind::Breakfast => "breakfast",
        BreakKind::Lunch => "lunch",
        BreakKind::Dinner => "dinner",
        BreakKind::Bedtime => "bedtime",
        BreakKind::Custom => "custom",
    }
}

/// The lines a card may say once its break is taken: the kind's own, then
/// the ones that fit any break. A glass of water is not thanked on behalf of
/// your spine.
pub fn done_lines(kind: BreakKind) -> Vec<Joke> {
    let pack = JokesPack::active();
    let own = match kind {
        BreakKind::Eyes | BreakKind::Move | BreakKind::Water => pack.done(deck_name(kind)),
        _ => &[],
    };
    own.iter().chain(pack.done("any")).cloned().collect()
}

/// The deck name `kind`'s done lines are dealt under.
pub fn done_deck(kind: BreakKind) -> String {
    format!("done.{}", deck_name(kind))
}

/// Deals the next line from a deck and moves the deal on; `None` for an
/// empty deck.
pub(super) fn deal(told: &mut BTreeMap<String, u32>, deck: &str, lines: &[Joke]) -> Option<Joke> {
    if lines.is_empty() {
        return None;
    }
    let turn = told.entry(deck.to_owned()).or_insert(0);
    let joke = lines[position(deck, *turn, lines.len())].clone();
    *turn = turn.wrapping_add(1);
    Some(joke)
}

/// Which line the `turn`th deal from a deck of `len` lines lands on.
pub fn position(deck: &str, turn: u32, len: usize) -> usize {
    let len_u32 = u32::try_from(len).unwrap_or(u32::MAX);
    let round = turn / len_u32;
    let mut order = shuffled(seed(deck, round), len);
    // Swapping the first two leaves the last in place for any deck of three
    // or more, so the previous round's plain shuffle is its real last line.
    if round > 0 && len >= MIN_DECK {
        let previous = shuffled(seed(deck, round - 1), len);
        if order[0] == previous[len - 1] {
            order.swap(0, 1);
        }
    }
    order[(turn % len_u32) as usize]
}

fn seed(deck: &str, round: u32) -> u64 {
    // FNV-1a over the name, so each deck shuffles differently.
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in deck.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    hash ^ u64::from(round).wrapping_mul(0x9e37_79b9_7f4a_7c15)
}

/// A Fisher–Yates shuffle of `0..len`, driven by splitmix64.
fn shuffled(mut state: u64, len: usize) -> Vec<usize> {
    let mut next = || {
        state = state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut z = state;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        z ^ (z >> 31)
    };
    let mut order: Vec<usize> = (0..len).collect();
    for i in (1..len).rev() {
        let j = (next() % (i as u64 + 1)) as usize;
        order.swap(i, j);
    }
    order
}
