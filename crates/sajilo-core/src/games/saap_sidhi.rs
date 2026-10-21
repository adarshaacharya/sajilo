//! साँप-सिँढी: snakes and ladders, you against the computer. Squares run
//! 1 to 100 in rows that turn at each end; a ladder's foot lifts you to its
//! top, a snake's head drops you to its tail. A six rolls again, and home
//! needs the exact number: a roll past 100 is lost.
//!
//! The dice are the shell's: every turn here takes its roll as a number, so
//! a game is the same for the same rolls and every rule is testable.

use serde::{Deserialize, Serialize};

pub const HOME: u8 = 100;

/// Ladders, foot to top.
pub const LADDERS: [(u8, u8); 8] = [
    (4, 25),
    (13, 46),
    (27, 64),
    (33, 49),
    (42, 63),
    (50, 69),
    (62, 81),
    (74, 92),
];

/// Snakes, head to tail.
pub const SNAKES: [(u8, u8); 8] = [
    (40, 3),
    (43, 18),
    (54, 31),
    (66, 45),
    (76, 58),
    (89, 53),
    (95, 72),
    (99, 41),
];

/// Where a piece that stops on `square` ends up.
pub fn after_jump(square: u8) -> u8 {
    LADDERS
        .iter()
        .chain(SNAKES.iter())
        .find(|(from, _)| *from == square)
        .map_or(square, |(_, to)| *to)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub enum SaapSide {
    You,
    Computer,
}

impl SaapSide {
    fn other(self) -> Self {
        match self {
            Self::You => Self::Computer,
            Self::Computer => Self::You,
        }
    }
}

/// One roll as it played out, for the screen to replay: the hop from
/// `from` to `landed`, then any ladder or snake on to `to`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct SaapMove {
    pub side: SaapSide,
    pub roll: u8,
    pub from: u8,
    pub landed: u8,
    pub to: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaapGame {
    /// Squares: 0 is off the board, before the first roll.
    pub you: u8,
    pub computer: u8,
    pub turn: SaapSide,
    pub winner: Option<SaapSide>,
}

impl SaapGame {
    pub fn new(first: SaapSide) -> Self {
        Self {
            you: 0,
            computer: 0,
            turn: first,
            winner: None,
        }
    }

    pub fn at(&self, side: SaapSide) -> u8 {
        match side {
            SaapSide::You => self.you,
            SaapSide::Computer => self.computer,
        }
    }

    /// Plays one roll for the side to move. A roll past home is lost; a six
    /// (when the game goes on) keeps the turn.
    pub fn roll(&mut self, roll: u8) -> Option<SaapMove> {
        if self.winner.is_some() || !(1..=6).contains(&roll) {
            return None;
        }
        let side = self.turn;
        let from = self.at(side);
        let landed = if from + roll > HOME {
            from
        } else {
            from + roll
        };
        let to = after_jump(landed);
        match side {
            SaapSide::You => self.you = to,
            SaapSide::Computer => self.computer = to,
        }
        if to == HOME {
            self.winner = Some(side);
        } else if roll != 6 {
            self.turn = side.other();
        }
        Some(SaapMove {
            side,
            roll,
            from,
            landed,
            to,
        })
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct SaapStats {
    pub won: u32,
    pub lost: u32,
    pub ladders: u32,
    pub snakes: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SaapState {
    pub game: Option<SaapGame>,
    pub stats: SaapStats,
    /// Whether the computer rolls first next game; it alternates.
    pub computer_starts: bool,
}

impl SaapState {
    /// A new game; who rolls first alternates. When the computer opens, its
    /// rolls come from `dice` and are returned to replay.
    pub fn start(&mut self, dice: &mut impl FnMut() -> u8) -> Vec<SaapMove> {
        let first = if self.computer_starts {
            SaapSide::Computer
        } else {
            SaapSide::You
        };
        self.computer_starts = !self.computer_starts;
        self.game = Some(SaapGame::new(first));
        self.computer_turns(dice)
    }

    /// The player's roll, then the computer's until it is the player's turn
    /// again or the game is over. Every move made, in order.
    pub fn play(&mut self, dice: &mut impl FnMut() -> u8) -> Vec<SaapMove> {
        let Some(game) = self.game.as_mut() else {
            return Vec::new();
        };
        if game.turn != SaapSide::You {
            return Vec::new();
        }
        let mut moves: Vec<SaapMove> = game.roll(dice()).into_iter().collect();
        if game.turn == SaapSide::Computer {
            moves.extend(self.computer_turns(dice));
        }
        self.tally(&moves);
        moves
    }

    fn computer_turns(&mut self, dice: &mut impl FnMut() -> u8) -> Vec<SaapMove> {
        let mut moves = Vec::new();
        let Some(game) = self.game.as_mut() else {
            return moves;
        };
        while game.turn == SaapSide::Computer && game.winner.is_none() {
            match game.roll(dice()) {
                Some(mv) => moves.push(mv),
                None => break,
            }
        }
        if let Some(winner) = game.winner
            && moves.last().is_some_and(|mv| mv.to == HOME)
        {
            self.record(winner);
        }
        moves
    }

    /// Counts the player's ladders and snakes, and a game the player won.
    fn tally(&mut self, moves: &[SaapMove]) {
        for mv in moves.iter().filter(|mv| mv.side == SaapSide::You) {
            if mv.to > mv.landed {
                self.stats.ladders += 1;
            } else if mv.to < mv.landed {
                self.stats.snakes += 1;
            }
            if mv.to == HOME {
                self.record(SaapSide::You);
            }
        }
    }

    fn record(&mut self, winner: SaapSide) {
        match winner {
            SaapSide::You => self.stats.won += 1,
            SaapSide::Computer => self.stats.lost += 1,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dice(rolls: &[u8]) -> impl FnMut() -> u8 + '_ {
        let mut next = rolls.iter().cycle();
        move || *next.next().unwrap()
    }

    #[test]
    fn ladders_lift_and_snakes_drop() {
        assert_eq!(after_jump(4), 25);
        assert_eq!(after_jump(99), 41);
        assert_eq!(after_jump(5), 5);
        // No square is both, and none leads off the board or to home.
        for (from, to) in LADDERS.iter().chain(SNAKES.iter()) {
            assert!(*from > 1 && *from < HOME && *to >= 1 && *to < HOME);
            assert_eq!(after_jump(*to), *to, "{to} isn't the start of another jump");
        }
    }

    #[test]
    fn a_roll_past_home_is_lost_and_the_exact_roll_wins() {
        let mut game = SaapGame::new(SaapSide::You);
        game.you = 97;
        let mv = game.roll(5).unwrap();
        assert_eq!((mv.landed, mv.to, game.you), (97, 97, 97));
        assert_eq!(game.turn, SaapSide::Computer);
        game.turn = SaapSide::You;
        game.roll(3).unwrap();
        assert_eq!(game.winner, Some(SaapSide::You));
        assert!(game.roll(2).is_none(), "nothing moves once it is over");
    }

    #[test]
    fn a_six_rolls_again() {
        let mut game = SaapGame::new(SaapSide::You);
        game.roll(6).unwrap();
        assert_eq!((game.you, game.turn), (6, SaapSide::You));
        game.roll(1).unwrap();
        assert_eq!(game.turn, SaapSide::Computer);
    }

    #[test]
    fn the_computer_answers_until_it_is_your_turn() {
        let mut state = SaapState::default();
        state.start(&mut dice(&[1]));
        // You roll 4 (onto the ladder to 25); the computer rolls 6 then 2.
        let moves = state.play(&mut dice(&[4, 6, 2]));
        assert_eq!(moves.len(), 3);
        assert_eq!((moves[0].landed, moves[0].to), (4, 25));
        assert_eq!(moves[1].side, SaapSide::Computer);
        assert_eq!(state.game.as_ref().unwrap().computer, 8);
        assert_eq!(state.game.as_ref().unwrap().turn, SaapSide::You);
        assert_eq!(state.stats.ladders, 1);
    }

    #[test]
    fn who_starts_alternates() {
        let mut state = SaapState::default();
        assert!(state.start(&mut dice(&[2])).is_empty(), "you roll first");
        let opening = state.start(&mut dice(&[2]));
        assert_eq!(opening.len(), 1);
        assert_eq!(opening[0].side, SaapSide::Computer);
    }

    #[test]
    fn a_game_ends_once_and_is_recorded_once() {
        let mut state = SaapState::default();
        state.start(&mut dice(&[1]));
        let mut turns = 0;
        let mut rng = 7u64;
        let mut roll = move || {
            rng = rng.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1);
            ((rng >> 33) % 6) as u8 + 1
        };
        while state.game.as_ref().unwrap().winner.is_none() && turns < 2000 {
            state.play(&mut roll);
            turns += 1;
        }
        assert!(state.game.as_ref().unwrap().winner.is_some());
        assert_eq!(state.stats.won + state.stats.lost, 1);
        assert!(state.play(&mut roll).is_empty());
    }
}
