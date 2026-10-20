//! Games as the screen shows them. The rules are `sajilo_core::games`.

use sajilo_core::NepaliDate;
use sajilo_core::games::shabda::{
    self, LENGTH, MAX_GUESSES, ShabdaMark, ShabdaState, ShabdaStats, ShabdaStatus, aksharas, score,
};

dto! {
    pub struct ShabdaTile {
        pub akshar: String,
        pub mark: ShabdaMark,
    }

    /// Today's word puzzle.
    pub struct ShabdaView {
        pub number: u32,
        pub length: u32,
        pub max_guesses: u32,
        pub rows: Vec<Vec<ShabdaTile>>,
        pub status: ShabdaStatus,
        /// Shown once the puzzle is over, never before.
        pub answer: Option<String>,
        /// The result as coloured squares, to paste anywhere. Once it is over.
        pub share: Option<String>,
        pub stats: ShabdaStats,
    }
}

/// Today's puzzle for `state`, already opened on `today`.
pub fn shabda_view(
    state: &ShabdaState,
    today: NepaliDate,
    number: u32,
    answer: &str,
) -> ShabdaView {
    let answer_letters = aksharas(answer).unwrap_or_default();
    let rows: Vec<Vec<ShabdaTile>> = state
        .guesses
        .iter()
        .map(|guess| {
            let letters = aksharas(guess).unwrap_or_default();
            let marks = score(&letters, &answer_letters);
            letters
                .into_iter()
                .zip(marks)
                .map(|(akshar, mark)| ShabdaTile { akshar, mark })
                .collect()
        })
        .collect();
    let status = state.status(answer);
    let over = status != ShabdaStatus::Playing;
    let share = over.then(|| {
        let tries = if status == ShabdaStatus::Won {
            rows.len().to_string()
        } else {
            "X".to_owned()
        };
        let grid: Vec<String> = rows
            .iter()
            .map(|row| row.iter().map(|tile| shabda::square(tile.mark)).collect())
            .collect();
        format!(
            "शब्द #{number} {tries}/{MAX_GUESSES}\n{}\nsajilo.fyi",
            grid.join("\n")
        )
    });
    let mut stats = state.stats.clone();
    stats.streak = state.current_streak(today);
    stats.distribution.resize(MAX_GUESSES, 0);
    ShabdaView {
        number,
        length: LENGTH as u32,
        max_guesses: MAX_GUESSES as u32,
        rows,
        status,
        answer: over.then(|| answer.to_owned()),
        share,
        stats,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_answer_and_the_grid_wait_until_it_is_over() {
        let mut state = ShabdaState::default();
        let day = NepaliDate::new(2083, 7, 3);
        state.guess(day, "बजार", "कलम").unwrap();
        let playing = shabda_view(&state, day, 1, "कलम");
        assert_eq!((playing.answer, playing.share), (None, None));
        assert_eq!(playing.rows[0][1].akshar, "जा");

        for word in ["सपना", "मौसम", "पहाड", "बादल", "गमला"]
        {
            state.guess(day, word, "कलम").unwrap();
        }
        let lost = shabda_view(&state, day, 1, "कलम");
        assert_eq!(lost.status, ShabdaStatus::Lost);
        assert_eq!(lost.answer.as_deref(), Some("कलम"));
        assert!(lost.share.unwrap().starts_with("शब्द #1 X/6\n"));
    }

    #[test]
    fn a_win_shares_its_squares() {
        let mut state = ShabdaState::default();
        let day = NepaliDate::new(2083, 7, 3);
        state.guess(day, "कमल", "कलम").unwrap();
        state.guess(day, "कलम", "कलम").unwrap();
        let won = shabda_view(&state, day, 7, "कलम");
        assert_eq!(won.share.unwrap(), "शब्द #7 2/6\n🟩🟨🟨\n🟩🟩🟩\nsajilo.fyi");
        assert_eq!(won.stats.distribution, [0, 1, 0, 0, 0, 0]);
    }
}

pub use quiz_view::*;

mod quiz_view {
    use sajilo_core::config::quiz::{QuizCategory, QuizPack};
    use sajilo_core::games::quiz::{QuizState, QuizStats, score};

    dto! {
        /// The question on screen, in the reader's language, options in
        /// this round's order.
        pub struct QuizQuestion {
            pub category: QuizCategory,
            /// 1-based, of `total`.
            pub number: u32,
            pub total: u32,
            pub question: String,
            pub options: Vec<String>,
            /// Once answered: the place chosen and the place that was right.
            pub chosen: Option<u8>,
            pub correct: Option<u8>,
        }

        /// The question of the day, as its card and the quiz screen show it.
        pub struct QuizDaily {
            pub category: QuizCategory,
            pub question: String,
            pub options: Vec<String>,
            pub chosen: Option<u8>,
            /// Shown once answered.
            pub correct: Option<u8>,
            /// Whether the daily card is on.
            pub enabled: bool,
        }

        pub struct QuizTopic {
            pub category: QuizCategory,
            pub total: u32,
            /// Not yet answered: what is left before the topic starts over.
            pub unseen: u32,
        }

        pub struct QuizView {
            /// The round under way, or the one just finished.
            pub question: Option<QuizQuestion>,
            pub in_round: bool,
            pub finished: bool,
            pub score: u32,
            pub round_total: u32,
            pub topic: Option<QuizCategory>,
            pub topics: Vec<QuizTopic>,
            pub stats: QuizStats,
        }
    }

    /// Today's question, already picked in `state`.
    pub fn quiz_daily(
        state: &QuizState,
        pack: &QuizPack,
        nepali: bool,
        enabled: bool,
    ) -> Option<QuizDaily> {
        let daily = state.daily.as_ref()?;
        let q = pack.questions.iter().find(|q| q.id == daily.id)?;
        let text = if nepali { &q.ne } else { &q.en };
        Some(QuizDaily {
            category: q.category,
            question: text.q.clone(),
            options: daily
                .order
                .iter()
                .filter_map(|o| text.options.get(usize::from(*o)).cloned())
                .collect(),
            chosen: daily.chosen,
            correct: daily.chosen.and_then(|_| {
                daily
                    .order
                    .iter()
                    .position(|o| *o == q.answer)
                    .map(|p| p as u8)
            }),
            enabled,
        })
    }

    pub fn quiz_view(state: &QuizState, pack: &QuizPack, nepali: bool) -> QuizView {
        let topics = QuizCategory::ALL
            .iter()
            .map(|category| {
                let ids = pack.questions.iter().filter(|q| q.category == *category);
                QuizTopic {
                    category: *category,
                    total: ids.clone().count() as u32,
                    unseen: ids.filter(|q| !state.seen.contains(&q.id)).count() as u32,
                }
            })
            .collect();
        let round = state.round.as_ref();
        let question = round.and_then(|round| {
            let index = round.current()?;
            let id = round.ids.get(index)?;
            let order = round.orders.get(index)?;
            let q = pack.questions.iter().find(|q| &q.id == id)?;
            let text = if nepali { &q.ne } else { &q.en };
            let answered = round
                .revealing
                .then(|| round.chosen.last().copied())
                .flatten();
            Some(QuizQuestion {
                category: q.category,
                number: index as u32 + 1,
                total: round.ids.len() as u32,
                question: text.q.clone(),
                options: order
                    .iter()
                    .filter_map(|o| text.options.get(usize::from(*o)).cloned())
                    .collect(),
                chosen: answered,
                correct: answered
                    .and_then(|_| order.iter().position(|o| *o == q.answer).map(|p| p as u8)),
            })
        });
        QuizView {
            question,
            in_round: round.is_some_and(|r| !r.finished()),
            finished: round.is_some_and(|r| r.finished()),
            score: round.map_or(0, |r| score(r, pack)),
            round_total: round.map_or(0, |r| r.ids.len() as u32),
            topic: round.and_then(|r| r.category),
            topics,
            stats: state.stats.clone(),
        }
    }
}

pub use boards_view::*;

mod boards_view {
    use chrono::{DateTime, Utc};
    use sajilo_core::games::bagh_chal::{
        BaghLevel, BaghMove, BaghOutcome, BaghPiece, BaghState, BaghStats,
    };
    use sajilo_core::games::sudoku::{SudokuLevel, SudokuState, SudokuStats};

    dto! {
        pub struct SudokuGameView {
            pub level: SudokuLevel,
            /// The starting digits; 0 for a cell to fill.
            pub givens: Vec<u8>,
            pub cells: Vec<u8>,
            /// Cells whose digit repeats in their row, column or box.
            pub conflicts: Vec<bool>,
            pub started_at: DateTime<Utc>,
            pub solved_in: Option<u32>,
        }

        pub struct SudokuView {
            /// `None` before the first puzzle.
            pub game: Option<SudokuGameView>,
            pub stats: SudokuStats,
        }

        pub struct BaghGameView {
            /// 25 points, row by row.
            pub points: Vec<Option<BaghPiece>>,
            pub goats_in_hand: u8,
            pub captured: u8,
            pub turn: BaghPiece,
            pub player: BaghPiece,
            pub level: BaghLevel,
            /// What the player may do now; empty on the computer's turn or
            /// once it's over.
            pub moves: Vec<BaghMove>,
            /// The computer's last move.
            pub last: Option<BaghMove>,
            pub outcome: Option<BaghOutcome>,
        }

        pub struct BaghView {
            pub game: Option<BaghGameView>,
            pub stats: BaghStats,
        }
    }

    pub fn sudoku_view(state: &SudokuState) -> SudokuView {
        SudokuView {
            game: state.game.as_ref().map(|game| SudokuGameView {
                level: game.level,
                givens: game.givens.clone(),
                cells: game.cells.clone(),
                conflicts: game.conflicts(),
                started_at: game.started_at,
                solved_in: game.solved_in,
            }),
            stats: state.stats.clone(),
        }
    }

    pub fn bagh_view(state: &BaghState) -> BaghView {
        BaghView {
            game: state.game.as_ref().map(|game| BaghGameView {
                points: game.board.points.clone(),
                goats_in_hand: game.board.goats_in_hand,
                captured: game.board.captured,
                turn: game.board.turn,
                player: game.player,
                level: game.level,
                moves: game.player_moves(),
                last: game.last,
                outcome: game.board.outcome(),
            }),
            stats: state.stats.clone(),
        }
    }
}
