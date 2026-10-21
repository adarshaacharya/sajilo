//! काटाकुटी: tic-tac-toe against the computer. Three in a row, column or
//! diagonal wins; X always moves first, and who is X alternates game by
//! game, since going first is the bigger half of winning.
//!
//! Easy mostly plays at random; Medium takes a win and blocks one but sees
//! nothing deeper; Hard searches the whole game, as a perfect player would,
//! yet slips about one move in six, so a careful player can still win.
//! Impossible never slips: the game is solved, so against it a draw is the
//! best there is.

use serde::{Deserialize, Serialize};

use super::sudoku::Rng;

pub const CELLS: usize = 9;

/// The eight ways to make three in a row.
const LINES: [[usize; 3]; 8] = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub enum KataMark {
    X,
    O,
}

impl KataMark {
    pub fn other(self) -> Self {
        match self {
            Self::X => Self::O,
            Self::O => Self::X,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub enum KataLevel {
    Easy,
    #[default]
    Medium,
    Hard,
    /// Perfect play: it can't lose.
    Impossible,
}

impl KataLevel {
    pub const ALL: [Self; 4] = [Self::Easy, Self::Medium, Self::Hard, Self::Impossible];

    pub fn index(self) -> usize {
        self as usize
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub enum KataOutcome {
    Won,
    Lost,
    Draw,
}

pub type Board = [Option<KataMark>; CELLS];

/// The mark with three in a row, and where.
pub fn winner(board: &Board) -> Option<(KataMark, [usize; 3])> {
    LINES.iter().find_map(|line| {
        let mark = board[line[0]]?;
        line.iter()
            .all(|cell| board[*cell] == Some(mark))
            .then_some((mark, *line))
    })
}

fn empty(board: &Board) -> Vec<usize> {
    (0..CELLS).filter(|cell| board[*cell].is_none()).collect()
}

/// The mark to move: X when the counts are even.
pub fn turn(board: &Board) -> KataMark {
    let placed = board.iter().flatten().count();
    if placed.is_multiple_of(2) {
        KataMark::X
    } else {
        KataMark::O
    }
}

/// The game's value for `me` with best play from here: 1 a win, 0 a draw,
/// -1 a loss. Quicker wins are not preferred over slower ones; on a board
/// this small any win will do.
fn value(board: &Board, me: KataMark) -> i32 {
    if let Some((mark, _)) = winner(board) {
        return if mark == me { 1 } else { -1 };
    }
    let moves = empty(board);
    if moves.is_empty() {
        return 0;
    }
    let to_move = turn(board);
    let results = moves.iter().map(|cell| {
        let mut next = *board;
        next[*cell] = Some(to_move);
        value(&next, me)
    });
    if to_move == me {
        results.max().unwrap_or(0)
    } else {
        results.min().unwrap_or(0)
    }
}

/// A move that makes three in a row for `mark` at once.
fn completing(board: &Board, mark: KataMark) -> Option<usize> {
    empty(board).into_iter().find(|cell| {
        let mut next = *board;
        next[*cell] = Some(mark);
        winner(&next).is_some()
    })
}

/// The computer's move for the side to play.
pub fn computer_move(board: &Board, level: KataLevel, seed: u64) -> Option<usize> {
    let moves = empty(board);
    if moves.is_empty() || winner(board).is_some() {
        return None;
    }
    let mut rng = Rng(seed);
    let me = turn(board);
    let random = |rng: &mut Rng| moves[rng.below(moves.len())];
    match level {
        KataLevel::Easy => {
            // Takes a win it can see now and then; otherwise anywhere.
            if rng.below(3) == 0
                && let Some(cell) = completing(board, me)
            {
                return Some(cell);
            }
            Some(random(&mut rng))
        }
        KataLevel::Medium => Some(
            completing(board, me)
                .or_else(|| completing(board, me.other()))
                .or_else(|| {
                    board[4]
                        .is_none()
                        .then_some(4)
                        .filter(|_| rng.below(2) == 0)
                })
                .unwrap_or_else(|| random(&mut rng)),
        ),
        KataLevel::Hard | KataLevel::Impossible => {
            if level == KataLevel::Hard && rng.below(6) == 0 {
                return Some(random(&mut rng));
            }
            let scored: Vec<(usize, i32)> = moves
                .iter()
                .map(|cell| {
                    let mut next = *board;
                    next[*cell] = Some(me);
                    (*cell, value(&next, me))
                })
                .collect();
            let best = scored.iter().map(|(_, score)| *score).max()?;
            let ties: Vec<usize> = scored
                .into_iter()
                .filter(|(_, score)| *score == best)
                .map(|(cell, _)| cell)
                .collect();
            Some(ties[rng.below(ties.len())])
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KataGame {
    pub board: Board,
    /// The player's mark: X when the player moves first.
    pub player: KataMark,
    pub level: KataLevel,
    /// The computer's last move, to show.
    pub last: Option<usize>,
    pub seed: u64,
}

impl KataGame {
    /// A new game; when the computer is X, it opens.
    pub fn new(player: KataMark, level: KataLevel, seed: u64) -> Self {
        let mut game = Self {
            board: [None; CELLS],
            player,
            level,
            last: None,
            seed,
        };
        game.answer();
        game
    }

    pub fn outcome(&self) -> Option<KataOutcome> {
        match winner(&self.board) {
            Some((mark, _)) if mark == self.player => Some(KataOutcome::Won),
            Some(_) => Some(KataOutcome::Lost),
            None if empty(&self.board).is_empty() => Some(KataOutcome::Draw),
            None => None,
        }
    }

    /// The computer moves if it is its turn.
    fn answer(&mut self) {
        if self.outcome().is_none() && turn(&self.board) != self.player {
            self.seed = self.seed.wrapping_add(1);
            if let Some(cell) = computer_move(&self.board, self.level, self.seed) {
                self.board[cell] = Some(self.player.other());
                self.last = Some(cell);
            }
        }
    }

    /// The player's move at `cell`, and the computer's answer. False when
    /// the move isn't allowed.
    pub fn play(&mut self, cell: usize) -> bool {
        if cell >= CELLS
            || self.board[cell].is_some()
            || self.outcome().is_some()
            || turn(&self.board) != self.player
        {
            return false;
        }
        self.board[cell] = Some(self.player);
        self.last = None;
        self.answer();
        true
    }
}

/// Games finished against each level: easy, medium, hard, impossible.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct KataStats {
    pub won: Vec<u32>,
    pub drawn: Vec<u32>,
    pub lost: Vec<u32>,
}

impl KataStats {
    pub fn record(&mut self, level: KataLevel, outcome: KataOutcome) {
        for list in [&mut self.won, &mut self.drawn, &mut self.lost] {
            list.resize(KataLevel::ALL.len(), 0);
        }
        let list = match outcome {
            KataOutcome::Won => &mut self.won,
            KataOutcome::Draw => &mut self.drawn,
            KataOutcome::Lost => &mut self.lost,
        };
        list[level.index()] += 1;
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct KataState {
    pub game: Option<KataGame>,
    pub stats: KataStats,
    /// Whether the computer opens the next game; it alternates.
    pub computer_starts: bool,
}

impl KataState {
    /// Starts a game at `level`, with the opener alternating.
    pub fn start(&mut self, level: KataLevel, seed: u64) {
        let player = if self.computer_starts {
            KataMark::O
        } else {
            KataMark::X
        };
        self.computer_starts = !self.computer_starts;
        self.game = Some(KataGame::new(player, level, seed));
    }

    /// Plays at `cell`; a game that ends counts once in the record.
    pub fn play(&mut self, cell: usize) -> bool {
        let Some(game) = self.game.as_mut() else {
            return false;
        };
        if !game.play(cell) {
            return false;
        }
        if let Some(outcome) = game.outcome() {
            let level = game.level;
            self.stats.record(level, outcome);
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn board(text: &str) -> Board {
        let mut board = [None; CELLS];
        for (cell, c) in text.chars().filter(|c| !c.is_whitespace()).enumerate() {
            board[cell] = match c {
                'X' => Some(KataMark::X),
                'O' => Some(KataMark::O),
                _ => None,
            };
        }
        board
    }

    #[test]
    fn three_in_a_row_wins_and_a_full_board_draws() {
        assert_eq!(
            winner(&board("XXX OO. ...")).map(|w| w.0),
            Some(KataMark::X)
        );
        assert_eq!(winner(&board("O.X .OX ..O")).map(|w| w.1), Some([0, 4, 8]));
        let draw = board("XOX XOO OXX");
        assert!(winner(&draw).is_none() && empty(&draw).is_empty());
    }

    #[test]
    fn medium_takes_its_win_before_blocking() {
        // O to move: O wins at 5; X also threatens at 2.
        let b = board("XX. OO. X..");
        for seed in 0..20 {
            assert_eq!(computer_move(&b, KataLevel::Medium, seed), Some(5));
        }
    }

    #[test]
    fn medium_blocks_a_threat() {
        let b = board("XX. .O. ...");
        for seed in 0..20 {
            assert_eq!(computer_move(&b, KataLevel::Medium, seed), Some(2));
        }
    }

    /// Hard plays perfectly when it doesn't slip: against every reply it
    /// never loses a game it opens without slipping.
    #[test]
    fn perfect_play_never_loses() {
        fn explore(board: Board, computer: KataMark) {
            if winner(&board).is_some() || empty(&board).is_empty() {
                assert_ne!(winner(&board).map(|w| w.0), Some(computer.other()));
                return;
            }
            if turn(&board) == computer {
                let me = computer;
                let best = empty(&board)
                    .into_iter()
                    .max_by_key(|cell| {
                        let mut next = board;
                        next[*cell] = Some(me);
                        value(&next, me)
                    })
                    .unwrap();
                let mut next = board;
                next[best] = Some(me);
                explore(next, computer);
            } else {
                for cell in empty(&board) {
                    let mut next = board;
                    next[cell] = Some(computer.other());
                    explore(next, computer);
                }
            }
        }
        explore([None; CELLS], KataMark::X);
        explore([None; CELLS], KataMark::O);
    }

    #[test]
    fn impossible_never_slips() {
        let b = board("XX. .O. ...");
        for seed in 0..200 {
            assert_eq!(computer_move(&b, KataLevel::Impossible, seed), Some(2));
        }
    }

    /// Whatever the player does, Impossible never loses a whole game.
    #[test]
    fn impossible_never_loses_a_game() {
        fn explore(game: KataGame) {
            match game.outcome() {
                Some(outcome) => assert_ne!(outcome, KataOutcome::Won),
                None => {
                    for cell in empty(&game.board) {
                        let mut next = game.clone();
                        if next.play(cell) {
                            explore(next);
                        }
                    }
                }
            }
        }
        explore(KataGame::new(KataMark::X, KataLevel::Impossible, 3));
        explore(KataGame::new(KataMark::O, KataLevel::Impossible, 3));
    }

    #[test]
    fn hard_can_slip_so_it_can_be_beaten() {
        let b = board("XX. .O. ...");
        let misses = (0..120)
            .filter(|seed| computer_move(&b, KataLevel::Hard, *seed) != Some(2))
            .count();
        assert!(misses > 0, "Hard sometimes leaves the win open");
        assert!(misses < 60, "but mostly blocks");
    }

    #[test]
    fn the_opener_alternates_and_the_computer_opens_as_x() {
        let mut state = KataState::default();
        state.start(KataLevel::Easy, 1);
        assert_eq!(state.game.as_ref().unwrap().player, KataMark::X);
        assert!(
            state
                .game
                .as_ref()
                .unwrap()
                .board
                .iter()
                .all(Option::is_none)
        );
        state.start(KataLevel::Easy, 1);
        let game = state.game.as_ref().unwrap();
        assert_eq!(game.player, KataMark::O);
        assert_eq!(
            game.board.iter().flatten().count(),
            1,
            "the computer opened"
        );
    }

    #[test]
    fn a_finished_game_counts_once() {
        let mut state = KataState::default();
        state.start(KataLevel::Easy, 7);
        let mut cell = 0;
        while state.game.as_ref().unwrap().outcome().is_none() && cell < CELLS {
            state.play(cell);
            cell += 1;
        }
        let total: u32 = [&state.stats.won, &state.stats.drawn, &state.stats.lost]
            .iter()
            .map(|list| list.iter().sum::<u32>())
            .sum();
        assert_eq!(total, 1);
        assert!(!state.play(8), "no move once it is over");
    }
}
