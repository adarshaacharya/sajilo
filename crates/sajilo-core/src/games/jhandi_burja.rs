//! झन्डी बुर्जा: six dice, each with the same six faces. Put coins on faces,
//! roll all six: a face that shows on two or more dice pays its stake once
//! for each, and the stake comes back too; one or none, and the stake is
//! lost. Two flags on a 10-coin bet return 30.
//!
//! The coins are pretend: a purse of them, kept from game to game, and a
//! new one when it runs out. Nothing here is money, or ever turns into it.
//!
//! The dice are the shell's: a round takes its rolls as numbers, so a round
//! is the same for the same rolls and every rule is testable.

use serde::{Deserialize, Serialize};

/// A face of the dice, and a square of the mat.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub enum JhandiFace {
    /// सुरथ (हुकुम), the spade.
    Hukum,
    /// बुर्जा, the crown.
    Burja,
    /// पान, the heart.
    Paan,
    /// चिडी, the club.
    Chidi,
    /// झन्डा (लंगुर), the crossed flags.
    Jhanda,
    /// ईंट, the diamond.
    Itta,
}

/// As the printed mat has them: spade, crown and heart above; club, flags
/// and diamond below.
pub const FACES: [JhandiFace; 6] = [
    JhandiFace::Hukum,
    JhandiFace::Burja,
    JhandiFace::Paan,
    JhandiFace::Chidi,
    JhandiFace::Jhanda,
    JhandiFace::Itta,
];

pub const DICE: usize = 6;
/// What a purse starts with, and what a new one holds.
pub const PURSE: u32 = 100;
/// The coins one tap puts down.
pub const STAKES: [u32; 4] = [1, 5, 10, 25];
/// A face needs this many dice to pay.
pub const TO_WIN: u32 = 2;

impl JhandiFace {
    fn index(self) -> usize {
        FACES.iter().position(|face| *face == self).unwrap_or(0)
    }
}

/// What a face's stake brings back when it shows on `count` dice: the
/// stake once for each, and the stake itself; nothing below two.
pub fn returned(stake: u32, count: u32) -> u32 {
    if count >= TO_WIN {
        stake.saturating_mul(count + 1)
    } else {
        0
    }
}

/// One roll as it played out.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct JhandiRound {
    /// The six dice, as they landed.
    pub dice: Vec<JhandiFace>,
    /// The stake on each face, in `FACES` order.
    pub bets: Vec<u32>,
    /// How many dice show each face, in `FACES` order.
    pub counts: Vec<u32>,
    /// Everything that came back, stakes included.
    pub returned: u32,
    /// What the purse gained or lost.
    pub net: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BetError {
    /// Nothing on the mat.
    NoBet,
    /// More down than the purse holds.
    OverPurse,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct JhandiStats {
    pub rounds: u32,
    /// Rounds that came out ahead.
    pub won: u32,
    /// The fullest the purse has been.
    pub best_purse: u32,
    /// The most one round has gained.
    pub biggest_win: u32,
    /// Purses that ran out.
    pub broke: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct JhandiState {
    pub purse: u32,
    pub stats: JhandiStats,
    pub last: Option<JhandiRound>,
}

impl Default for JhandiState {
    fn default() -> Self {
        Self {
            purse: PURSE,
            stats: JhandiStats {
                best_purse: PURSE,
                ..JhandiStats::default()
            },
            last: None,
        }
    }
}

impl JhandiState {
    /// Rolls the six dice for `bets` (a stake per face, in `FACES` order).
    /// `die` gives 1 to 6, one per die; anything else counts as the flag.
    pub fn roll(
        &mut self,
        bets: [u32; 6],
        die: &mut impl FnMut() -> u8,
    ) -> Result<&JhandiRound, BetError> {
        let staked = bets.iter().fold(0u32, |sum, bet| sum.saturating_add(*bet));
        if staked == 0 {
            return Err(BetError::NoBet);
        }
        if staked > self.purse {
            return Err(BetError::OverPurse);
        }
        let dice: Vec<JhandiFace> = (0..DICE)
            .map(|_| FACES[usize::from(die().clamp(1, 6) - 1)])
            .collect();
        let mut counts = [0u32; 6];
        for face in &dice {
            counts[face.index()] += 1;
        }
        let back = bets.iter().zip(counts).fold(0u32, |sum, (bet, count)| {
            sum.saturating_add(returned(*bet, count))
        });
        self.purse = self.purse - staked + back;
        let gained = i64::from(back) - i64::from(staked);
        let net = i32::try_from(gained).unwrap_or(if gained > 0 { i32::MAX } else { i32::MIN });

        let stats = &mut self.stats;
        stats.rounds += 1;
        if net > 0 {
            stats.won += 1;
            stats.biggest_win = stats.biggest_win.max(net.unsigned_abs());
        }
        stats.best_purse = stats.best_purse.max(self.purse);
        if self.purse == 0 {
            stats.broke += 1;
        }
        Ok(self.last.insert(JhandiRound {
            dice,
            bets: bets.to_vec(),
            counts: counts.to_vec(),
            returned: back,
            net,
        }))
    }

    /// A fresh start whenever the user wants one: a new purse in place of
    /// whatever is left, and the mat cleared. The record stays.
    pub fn start_over(&mut self) {
        self.purse = PURSE;
        self.last = None;
    }

    /// A new purse, once the old one is empty.
    pub fn refill(&mut self) -> bool {
        if self.purse > 0 {
            return false;
        }
        self.purse = PURSE;
        self.last = None;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dice(rolls: &[u8]) -> impl FnMut() -> u8 + '_ {
        let mut next = rolls.iter().cycle();
        move || *next.next().unwrap()
    }

    /// The die numbers that land on `faces`.
    fn landing(faces: &[JhandiFace]) -> Vec<u8> {
        faces.iter().map(|face| face.index() as u8 + 1).collect()
    }

    fn on(face: JhandiFace, stake: u32) -> [u32; 6] {
        let mut bets = [0; 6];
        bets[face.index()] = stake;
        bets
    }

    #[test]
    fn two_or_more_pay_and_one_does_not() {
        assert_eq!(returned(10, 0), 0);
        assert_eq!(returned(10, 1), 0);
        assert_eq!(returned(10, 2), 30, "two flags on 10: 20 won, 10 back");
        assert_eq!(returned(10, 6), 70);
    }

    #[test]
    fn a_round_settles_every_face() {
        let mut state = JhandiState::default();
        use JhandiFace::*;
        let mut bets = on(Jhanda, 10);
        bets[Burja.index()] = 5;
        let rolls = landing(&[Jhanda, Jhanda, Burja, Itta, Paan, Hukum]);
        let round = state.roll(bets, &mut dice(&rolls)).unwrap();
        assert_eq!(round.counts, vec![1, 1, 1, 0, 2, 1]);
        assert_eq!(round.returned, 30, "the flags pay; one crown loses its 5");
        assert_eq!(round.net, 15);
        assert_eq!(state.purse, 115);
        assert_eq!(state.stats.biggest_win, 15);
        assert_eq!(state.stats.best_purse, 115);
    }

    #[test]
    fn a_bet_must_be_down_and_within_the_purse() {
        let mut state = JhandiState::default();
        let mut roll = dice(&[1]);
        assert_eq!(state.roll([0; 6], &mut roll), Err(BetError::NoBet));
        assert_eq!(
            state.roll(on(JhandiFace::Paan, 101), &mut roll),
            Err(BetError::OverPurse)
        );
        assert_eq!(state.purse, PURSE, "nothing was taken");
        assert_eq!(state.stats.rounds, 0);
    }

    #[test]
    fn an_empty_purse_is_counted_and_refilled_once() {
        let mut state = JhandiState::default();
        assert!(!state.refill(), "only an empty purse is refilled");
        // All in on the club; no club comes up.
        use JhandiFace::*;
        let rolls = landing(&[Hukum, Burja, Paan, Jhanda, Itta, Hukum]);
        state.roll(on(Chidi, 100), &mut dice(&rolls)).unwrap();
        assert_eq!((state.purse, state.stats.broke), (0, 1));
        assert!(state.refill());
        assert_eq!(state.purse, PURSE);
        assert!(state.last.is_none());
    }

    #[test]
    fn starting_over_keeps_the_record() {
        let mut state = JhandiState::default();
        use JhandiFace::*;
        let rolls = landing(&[Hukum, Hukum, Burja, Paan, Jhanda, Itta]);
        state.roll(on(Hukum, 10), &mut dice(&rolls)).unwrap();
        assert_eq!(state.purse, 120);
        state.start_over();
        assert_eq!(state.purse, PURSE);
        assert!(state.last.is_none());
        assert_eq!((state.stats.rounds, state.stats.best_purse), (1, 120));
    }

    #[test]
    fn the_house_keeps_a_little() {
        // Every one of the 6^6 ways the dice can land, a coin on the flag:
        // on average a bet comes back short, as the game is played.
        let mut back = 0u64;
        let mut ways = 0u64;
        for n in 0..6u32.pow(6) {
            let flags = (0..6).filter(|i| (n / 6u32.pow(*i)) % 6 == 0).count() as u32;
            back += u64::from(returned(1, flags));
            ways += 1;
        }
        let average = back as f64 / ways as f64;
        assert!((0.80..0.95).contains(&average), "{average}");
    }
}
