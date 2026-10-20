//! बाघचाल: four tigers against twenty goats on a 5×5 board of lines.
//!
//! Goats are placed one at a time, then moved; tigers move from the start
//! and capture by jumping a goat along a line to the empty point beyond.
//! Tigers win with five captures; goats win when no tiger can move. A game
//! that goes on past [`MAX_PLIES`] is a draw, so it can't run forever.
//!
//! Points are numbered 0–24, row by row. Every point joins its neighbours
//! across and down; the points whose row and column add up to an even
//! number also join diagonally.

use serde::{Deserialize, Serialize};

use super::sudoku::Rng;

pub const POINTS: usize = 25;
const SIDE: i32 = 5;
pub const GOATS: u8 = 20;
pub const CAPTURES_TO_WIN: u8 = 5;
/// Moves by both sides after which the game is drawn.
pub const MAX_PLIES: u32 = 200;
const CORNERS: [usize; 4] = [0, 4, 20, 24];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub enum BaghPiece {
    Tiger,
    Goat,
}

impl BaghPiece {
    pub fn other(self) -> Self {
        match self {
            Self::Tiger => Self::Goat,
            Self::Goat => Self::Tiger,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct BaghMove {
    /// `None` for a goat being placed.
    pub from: Option<u8>,
    pub to: u8,
    /// The goat a tiger jumps over and captures.
    pub capture: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub points: Vec<Option<BaghPiece>>,
    pub goats_in_hand: u8,
    pub captured: u8,
    pub turn: BaghPiece,
    pub plies: u32,
}

impl Default for Board {
    fn default() -> Self {
        let mut points = vec![None; POINTS];
        for corner in CORNERS {
            points[corner] = Some(BaghPiece::Tiger);
        }
        Self {
            points,
            goats_in_hand: GOATS,
            captured: 0,
            turn: BaghPiece::Goat,
            plies: 0,
        }
    }
}

const DIRECTIONS: [(i32, i32); 8] = [
    (-1, 0),
    (1, 0),
    (0, -1),
    (0, 1),
    (-1, -1),
    (-1, 1),
    (1, -1),
    (1, 1),
];

fn at(row: i32, col: i32) -> Option<usize> {
    ((0..SIDE).contains(&row) && (0..SIDE).contains(&col)).then(|| (row * SIDE + col) as usize)
}

/// Lines out of `point`: each neighbour, and the point beyond it on the
/// same line, if any.
fn lines(point: usize) -> impl Iterator<Item = (usize, Option<usize>)> {
    let (row, col) = (point as i32 / SIDE, point as i32 % SIDE);
    let diagonal = (row + col) % 2 == 0;
    DIRECTIONS
        .into_iter()
        .filter(move |(dr, dc)| diagonal || *dr == 0 || *dc == 0)
        .filter_map(move |(dr, dc)| {
            let next = at(row + dr, col + dc)?;
            Some((next, at(row + 2 * dr, col + 2 * dc)))
        })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub enum BaghOutcome {
    TigersWin,
    GoatsWin,
    Draw,
}

impl Board {
    /// Every legal move for the side to play.
    pub fn moves(&self) -> Vec<BaghMove> {
        let mut out = Vec::new();
        match self.turn {
            BaghPiece::Goat if self.goats_in_hand > 0 => {
                for (to, point) in self.points.iter().enumerate() {
                    if point.is_none() {
                        out.push(BaghMove {
                            from: None,
                            to: to as u8,
                            capture: None,
                        });
                    }
                }
            }
            side => {
                for (from, point) in self.points.iter().enumerate() {
                    if *point != Some(side) {
                        continue;
                    }
                    for (next, beyond) in lines(from) {
                        match self.points[next] {
                            None => out.push(BaghMove {
                                from: Some(from as u8),
                                to: next as u8,
                                capture: None,
                            }),
                            Some(BaghPiece::Goat) if side == BaghPiece::Tiger => {
                                if let Some(beyond) = beyond.filter(|b| self.points[*b].is_none()) {
                                    out.push(BaghMove {
                                        from: Some(from as u8),
                                        to: beyond as u8,
                                        capture: Some(next as u8),
                                    });
                                }
                            }
                            Some(_) => {}
                        }
                    }
                }
            }
        }
        out
    }

    /// The board after `mv`, with the other side to play.
    pub fn apply(&self, mv: BaghMove) -> Self {
        let mut next = self.clone();
        let piece = if let Some(from) = mv.from {
            next.points[usize::from(from)].take()
        } else {
            next.goats_in_hand = next.goats_in_hand.saturating_sub(1);
            Some(BaghPiece::Goat)
        };
        next.points[usize::from(mv.to)] = piece;
        if let Some(capture) = mv.capture {
            next.points[usize::from(capture)] = None;
            next.captured += 1;
        }
        next.turn = self.turn.other();
        next.plies += 1;
        next
    }

    pub fn outcome(&self) -> Option<BaghOutcome> {
        if self.captured >= CAPTURES_TO_WIN {
            return Some(BaghOutcome::TigersWin);
        }
        if self.moves().is_empty() {
            // A side that can't move has lost; goats are never really stuck.
            return Some(match self.turn {
                BaghPiece::Tiger => BaghOutcome::GoatsWin,
                BaghPiece::Goat => BaghOutcome::TigersWin,
            });
        }
        (self.plies >= MAX_PLIES).then_some(BaghOutcome::Draw)
    }

    /// How good the board is for the tigers: captures above all, then room
    /// to move and goats left open to a jump.
    fn score(&self) -> i32 {
        match self.outcome() {
            Some(BaghOutcome::TigersWin) => return 10_000 - self.plies as i32,
            Some(BaghOutcome::GoatsWin) => return -10_000 + self.plies as i32,
            Some(BaghOutcome::Draw) => return 0,
            None => {}
        }
        let mut mobility = 0;
        let mut threats = 0;
        let mut trapped = 0;
        for (from, point) in self.points.iter().enumerate() {
            if *point != Some(BaghPiece::Tiger) {
                continue;
            }
            let mut can_move = false;
            for (next, beyond) in lines(from) {
                match self.points[next] {
                    None => {
                        mobility += 1;
                        can_move = true;
                    }
                    Some(BaghPiece::Goat) if beyond.is_some_and(|b| self.points[b].is_none()) => {
                        threats += 1;
                        can_move = true;
                    }
                    _ => {}
                }
            }
            if !can_move {
                trapped += 1;
            }
        }
        i32::from(self.captured) * 120 + threats * 25 + mobility * 3 - trapped * 40
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub enum BaghLevel {
    #[default]
    Easy,
    Medium,
    Hard,
}

impl BaghLevel {
    fn depth(self) -> u32 {
        match self {
            Self::Easy => 1,
            Self::Medium => 3,
            Self::Hard => 4,
        }
    }
}

fn search(board: &Board, depth: u32, mut alpha: i32, mut beta: i32) -> i32 {
    if depth == 0 || board.outcome().is_some() {
        return board.score();
    }
    let moves = board.moves();
    if board.turn == BaghPiece::Tiger {
        let mut best = i32::MIN;
        for mv in moves {
            best = best.max(search(&board.apply(mv), depth - 1, alpha, beta));
            alpha = alpha.max(best);
            if alpha >= beta {
                break;
            }
        }
        best
    } else {
        let mut best = i32::MAX;
        for mv in moves {
            best = best.min(search(&board.apply(mv), depth - 1, alpha, beta));
            beta = beta.min(best);
            if alpha >= beta {
                break;
            }
        }
        best
    }
}

/// The computer's move for the side to play. Easy sometimes plays any legal
/// move; ties are broken at random so games don't repeat.
pub fn best_move(board: &Board, level: BaghLevel, seed: u64) -> Option<BaghMove> {
    let mut rng = Rng(seed);
    let mut moves = board.moves();
    if moves.is_empty() {
        return None;
    }
    rng.shuffle(&mut moves);
    if level == BaghLevel::Easy && rng.below(3) == 0 {
        return moves.first().copied();
    }
    let tigers = board.turn == BaghPiece::Tiger;
    let depth = level.depth();
    moves
        .into_iter()
        .map(|mv| (mv, search(&board.apply(mv), depth - 1, i32::MIN, i32::MAX)))
        .max_by_key(|(_, score)| if tigers { *score } else { -*score })
        .map(|(mv, _)| mv)
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct BaghStats {
    pub won_as_goats: u32,
    pub lost_as_goats: u32,
    pub won_as_tigers: u32,
    pub lost_as_tigers: u32,
    pub draws: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaghGame {
    pub board: Board,
    /// The side the player plays.
    pub player: BaghPiece,
    pub level: BaghLevel,
    /// The computer's last move, to show.
    pub last: Option<BaghMove>,
    pub seed: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BaghState {
    pub game: Option<BaghGame>,
    pub stats: BaghStats,
}

impl BaghGame {
    /// A new game; when the player takes the tigers, the computer's goats
    /// open.
    pub fn new(player: BaghPiece, level: BaghLevel, seed: u64) -> Self {
        let mut game = Self {
            board: Board::default(),
            player,
            level,
            last: None,
            seed,
        };
        game.reply();
        game
    }

    fn reply(&mut self) {
        if self.board.outcome().is_none() && self.board.turn != self.player {
            self.seed = self.seed.wrapping_add(1);
            if let Some(mv) = best_move(&self.board, self.level, self.seed) {
                self.board = self.board.apply(mv);
                self.last = Some(mv);
            }
        }
    }

    /// Plays the player's move, if legal, and the computer's answer.
    pub fn play(&mut self, from: Option<u8>, to: u8) -> bool {
        if self.board.outcome().is_some() || self.board.turn != self.player {
            return false;
        }
        let Some(mv) = self
            .board
            .moves()
            .into_iter()
            .find(|mv| mv.from == from && mv.to == to)
        else {
            return false;
        };
        self.board = self.board.apply(mv);
        self.last = None;
        self.reply();
        true
    }

    /// The moves the player can make now; empty on the computer's turn.
    pub fn player_moves(&self) -> Vec<BaghMove> {
        if self.board.turn == self.player && self.board.outcome().is_none() {
            self.board.moves()
        } else {
            Vec::new()
        }
    }
}

impl BaghStats {
    pub fn record(&mut self, player: BaghPiece, outcome: BaghOutcome) {
        match (player, outcome) {
            (_, BaghOutcome::Draw) => self.draws += 1,
            (BaghPiece::Goat, BaghOutcome::GoatsWin) => self.won_as_goats += 1,
            (BaghPiece::Goat, BaghOutcome::TigersWin) => self.lost_as_goats += 1,
            (BaghPiece::Tiger, BaghOutcome::TigersWin) => self.won_as_tigers += 1,
            (BaghPiece::Tiger, BaghOutcome::GoatsWin) => self.lost_as_tigers += 1,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_board_starts_with_tigers_in_the_corners_and_goats_to_place() {
        let board = Board::default();
        assert_eq!(board.turn, BaghPiece::Goat);
        assert_eq!(
            board.moves().len(),
            POINTS - 4,
            "a goat may go on any empty point"
        );
    }

    #[test]
    fn diagonals_only_from_even_points() {
        // 0 is even: across, down and diagonal. 1 is odd: no diagonal.
        assert_eq!(lines(0).count(), 3);
        assert_eq!(lines(1).count(), 3);
        assert_eq!(lines(12).count(), 8);
        assert_eq!(lines(7).count(), 4);
    }

    #[test]
    fn a_tiger_jumps_a_goat_with_space_beyond() {
        let mut board = Board::default();
        board = board.apply(BaghMove {
            from: None,
            to: 1,
            capture: None,
        });
        // Tiger at 0, goat at 1, 2 empty: a capture is on offer.
        let jump = board
            .moves()
            .into_iter()
            .find(|mv| mv.capture == Some(1))
            .unwrap();
        assert_eq!((jump.from, jump.to), (Some(0), 2));
        let after = board.apply(jump);
        assert_eq!(after.captured, 1);
        assert_eq!(after.points[1], None);
    }

    #[test]
    fn five_captures_win_for_the_tigers() {
        let board = Board {
            captured: CAPTURES_TO_WIN,
            ..Board::default()
        };
        assert_eq!(board.outcome(), Some(BaghOutcome::TigersWin));
    }

    #[test]
    fn a_tiger_with_nowhere_to_go_is_trapped() {
        let mut board = Board {
            points: vec![None; POINTS],
            turn: BaghPiece::Tiger,
            goats_in_hand: 0,
            ..Board::default()
        };
        board.points[0] = Some(BaghPiece::Tiger);
        for goat in [1, 2, 5, 10, 6, 12] {
            board.points[goat] = Some(BaghPiece::Goat);
        }
        assert_eq!(board.outcome(), Some(BaghOutcome::GoatsWin));
    }

    #[test]
    fn the_computer_takes_a_free_capture() {
        let mut board = Board::default();
        board = board.apply(BaghMove {
            from: None,
            to: 1,
            capture: None,
        });
        let mv = best_move(&board, BaghLevel::Medium, 1).unwrap();
        assert_eq!(mv.capture, Some(1));
    }

    #[test]
    fn a_whole_game_against_itself_ends() {
        let mut board = Board::default();
        let mut seed = 0;
        while board.outcome().is_none() {
            seed += 1;
            let mv = best_move(&board, BaghLevel::Easy, seed).unwrap();
            board = board.apply(mv);
        }
        assert!(board.plies <= MAX_PLIES);
    }

    #[test]
    fn the_player_moves_and_the_computer_answers() {
        let mut game = BaghGame::new(BaghPiece::Goat, BaghLevel::Easy, 5);
        assert_eq!(game.player_moves().len(), POINTS - 4);
        assert!(game.play(None, 12));
        assert_eq!(game.board.turn, BaghPiece::Goat, "the tigers have answered");
        assert!(game.last.is_some());
        assert!(!game.play(None, 12), "that point is taken");
    }

    #[test]
    fn playing_the_tigers_the_goats_open() {
        let game = BaghGame::new(BaghPiece::Tiger, BaghLevel::Easy, 2);
        assert_eq!(game.board.goats_in_hand, GOATS - 1);
        assert_eq!(game.board.turn, BaghPiece::Tiger);
    }
}
