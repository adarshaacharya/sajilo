//! Mini Sudoku: a 6×6 grid in 2×3 boxes, digits 1–6. Two to four minutes,
//! which is what a tray app's game should take.
//!
//! Every puzzle is made here, from a solved grid shuffled in the ways that
//! keep it solved, then emptied one cell at a time while it still has
//! exactly one solution. So no two games are alike and none is unfair.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub const N: usize = 6;
const BOX_ROWS: usize = 2;
const BOX_COLS: usize = 3;
pub const CELLS: usize = N * N;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub enum SudokuLevel {
    #[default]
    Easy,
    Medium,
    Hard,
}

impl SudokuLevel {
    pub const ALL: [Self; 3] = [Self::Easy, Self::Medium, Self::Hard];

    /// Cells filled in at the start.
    fn givens(self) -> usize {
        match self {
            Self::Easy => 18,
            Self::Medium => 14,
            Self::Hard => 11,
        }
    }

    pub fn index(self) -> usize {
        match self {
            Self::Easy => 0,
            Self::Medium => 1,
            Self::Hard => 2,
        }
    }
}

/// SplitMix64: random enough for puzzles, repeatable in tests.
pub(crate) struct Rng(pub(crate) u64);

impl Rng {
    pub(crate) fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    pub(crate) fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }

    pub(crate) fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            items.swap(i, self.below(i + 1));
        }
    }
}

fn box_of(cell: usize) -> usize {
    let (row, col) = (cell / N, cell % N);
    (row / BOX_ROWS) * (N / BOX_COLS) + col / BOX_COLS
}

fn peers(a: usize, b: usize) -> bool {
    a != b && (a / N == b / N || a % N == b % N || box_of(a) == box_of(b))
}

/// A solved grid, shuffled: digits relabelled, rows swapped within their
/// band, bands swapped, columns within their stack, stacks swapped.
fn solved(rng: &mut Rng) -> Vec<u8> {
    let mut digits: Vec<u8> = (1..=N as u8).collect();
    rng.shuffle(&mut digits);
    let mut bands: Vec<usize> = (0..N / BOX_ROWS).collect();
    rng.shuffle(&mut bands);
    let rows: Vec<usize> = bands
        .iter()
        .flat_map(|band| {
            let mut within: Vec<usize> = (0..BOX_ROWS).map(|r| band * BOX_ROWS + r).collect();
            rng.shuffle(&mut within);
            within
        })
        .collect();
    let mut stacks: Vec<usize> = (0..N / BOX_COLS).collect();
    rng.shuffle(&mut stacks);
    let cols: Vec<usize> = stacks
        .iter()
        .flat_map(|stack| {
            let mut within: Vec<usize> = (0..BOX_COLS).map(|c| stack * BOX_COLS + c).collect();
            rng.shuffle(&mut within);
            within
        })
        .collect();
    let mut grid = vec![0; CELLS];
    for (r, row) in rows.iter().enumerate() {
        for (c, col) in cols.iter().enumerate() {
            // The textbook solved pattern for 2×3 boxes.
            let base = (BOX_COLS * (row % BOX_ROWS) + row / BOX_ROWS + col) % N;
            grid[r * N + c] = digits[base];
        }
    }
    grid
}

/// How many solutions `grid` has, counting no further than `limit`.
fn solutions(grid: &mut [u8], limit: usize) -> usize {
    let Some(empty) = grid.iter().position(|v| *v == 0) else {
        return 1;
    };
    let mut found = 0;
    for digit in 1..=N as u8 {
        if (0..CELLS).any(|other| peers(empty, other) && grid[other] == digit) {
            continue;
        }
        grid[empty] = digit;
        found += solutions(grid, limit - found);
        grid[empty] = 0;
        if found >= limit {
            break;
        }
    }
    found
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SudokuGame {
    pub level: SudokuLevel,
    pub solution: Vec<u8>,
    /// The starting cells; 0 for one to fill.
    pub givens: Vec<u8>,
    /// What is on the grid now, givens included.
    pub cells: Vec<u8>,
    pub started_at: DateTime<Utc>,
    /// Seconds it took, once solved.
    pub solved_in: Option<u32>,
}

impl SudokuGame {
    /// A new puzzle at `level`, with exactly one solution.
    pub fn new(level: SudokuLevel, seed: u64, now: DateTime<Utc>) -> Self {
        let mut rng = Rng(seed);
        let solution = solved(&mut rng);
        let mut givens = solution.clone();
        let mut order: Vec<usize> = (0..CELLS).collect();
        rng.shuffle(&mut order);
        let mut filled = CELLS;
        for cell in order {
            if filled <= level.givens() {
                break;
            }
            let kept = givens[cell];
            givens[cell] = 0;
            if solutions(&mut givens.clone(), 2) == 1 {
                filled -= 1;
            } else {
                givens[cell] = kept;
            }
        }
        Self {
            level,
            cells: givens.clone(),
            givens,
            solution,
            started_at: now,
            solved_in: None,
        }
    }

    /// Puts `digit` in `cell`, or clears it with 0. Givens don't change, and
    /// nothing changes once solved. Returns whether this move solved it.
    pub fn set(&mut self, cell: usize, digit: u8, now: DateTime<Utc>) -> bool {
        if self.solved_in.is_some()
            || cell >= CELLS
            || self.givens[cell] != 0
            || usize::from(digit) > N
        {
            return false;
        }
        self.cells[cell] = digit;
        // Any full grid without a conflict is solved, even one that differs
        // from ours: with a unique solution it can't, but it costs nothing.
        if self.cells.iter().all(|v| *v != 0) && !self.conflicts().contains(&true) {
            self.solved_in = Some(
                u32::try_from((now - self.started_at).num_seconds().max(0)).unwrap_or(u32::MAX),
            );
            return true;
        }
        false
    }

    /// For each cell, whether its digit repeats in its row, column or box.
    pub fn conflicts(&self) -> Vec<bool> {
        (0..CELLS)
            .map(|cell| {
                let digit = self.cells[cell];
                digit != 0
                    && (0..CELLS).any(|other| peers(cell, other) && self.cells[other] == digit)
            })
            .collect()
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct SudokuStats {
    /// Solved, by level: easy, medium, hard.
    pub solved: Vec<u32>,
    /// Fastest, in seconds, by level; 0 for none yet.
    pub best_seconds: Vec<u32>,
}

impl SudokuStats {
    pub fn record(&mut self, level: SudokuLevel, seconds: u32) {
        self.solved.resize(SudokuLevel::ALL.len(), 0);
        self.best_seconds.resize(SudokuLevel::ALL.len(), 0);
        let index = level.index();
        self.solved[index] += 1;
        let best = &mut self.best_seconds[index];
        if *best == 0 || seconds < *best {
            *best = seconds;
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SudokuState {
    pub game: Option<SudokuGame>,
    pub stats: SudokuStats,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn now() -> DateTime<Utc> {
        DateTime::from_timestamp(1_800_000_000, 0).unwrap()
    }

    #[test]
    fn a_shuffled_grid_is_still_solved() {
        for seed in 0..20 {
            let grid = solved(&mut Rng(seed));
            for cell in 0..CELLS {
                for other in 0..CELLS {
                    if peers(cell, other) {
                        assert_ne!(grid[cell], grid[other], "seed {seed}");
                    }
                }
            }
        }
    }

    #[test]
    fn every_puzzle_has_one_solution_and_the_right_number_of_clues() {
        for (seed, level) in [
            (1, SudokuLevel::Easy),
            (2, SudokuLevel::Medium),
            (3, SudokuLevel::Hard),
        ] {
            let game = SudokuGame::new(level, seed, now());
            let mut grid = game.givens.clone();
            assert_eq!(solutions(&mut grid, 2), 1);
            let clues = game.givens.iter().filter(|v| **v != 0).count();
            assert!(
                clues >= level.givens() && clues <= level.givens() + 4,
                "{level:?}: {clues}"
            );
        }
    }

    #[test]
    fn filling_it_in_solves_it_and_records_the_time() {
        let mut game = SudokuGame::new(SudokuLevel::Easy, 9, now());
        let blanks: Vec<usize> = (0..CELLS).filter(|c| game.givens[*c] == 0).collect();
        let later = now() + chrono::Duration::seconds(95);
        for (i, cell) in blanks.iter().enumerate() {
            let solved = game.set(*cell, game.solution[*cell], later);
            assert_eq!(solved, i == blanks.len() - 1);
        }
        assert_eq!(game.solved_in, Some(95));
        let mut stats = SudokuStats::default();
        stats.record(SudokuLevel::Easy, 95);
        assert_eq!((stats.solved[0], stats.best_seconds[0]), (1, 95));
    }

    #[test]
    fn givens_stay_and_repeats_are_flagged() {
        let mut game = SudokuGame::new(SudokuLevel::Easy, 4, now());
        let given = (0..CELLS).find(|c| game.givens[*c] != 0).unwrap();
        assert!(!game.set(given, 0, now()));
        assert_eq!(game.cells[given], game.givens[given]);
        // A blank in the same row as `given`, set to the given's digit.
        let row = given / N;
        if let Some(blank) = (row * N..row * N + N).find(|c| game.givens[*c] == 0) {
            game.set(blank, game.givens[given], now());
            let conflicts = game.conflicts();
            assert!(conflicts[blank] && conflicts[given]);
        }
    }
}
