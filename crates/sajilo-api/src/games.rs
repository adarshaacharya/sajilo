//! Games as the screen shows them. The rules are `sajilo_core::games`.

use sajilo_core::games::shabda::{
    CONSONANTS, MAX_WRONG, ShabdaState, ShabdaStats, ShabdaStatus, VOWELS,
};

dto! {
    /// One place in the word: its akshar once found, or at the end.
    pub struct ShabdaTile {
        /// `None` while hidden.
        pub akshar: Option<String>,
        /// Shown only because the word was lost.
        pub missed: bool,
    }

    /// A letter on the pad, and what guessing it showed.
    pub struct ShabdaKey {
        pub letter: String,
        pub state: ShabdaKeyState,
    }

    /// The word under way.
    pub struct ShabdaView {
        pub tiles: Vec<ShabdaTile>,
        /// The word's meaning in a few words, in the reader's language.
        pub clue: Option<String>,
        /// The vowels, then the consonants, in the alphabet's order.
        pub vowels: Vec<ShabdaKey>,
        pub consonants: Vec<ShabdaKey>,
        pub status: ShabdaStatus,
        pub lives: u32,
        pub lives_left: u32,
        pub hint_left: bool,
        /// The word, once it is over.
        pub answer: Option<String>,
        pub stats: ShabdaStats,
    }
}

dto_enum! {
    pub enum ShabdaKeyState {
        Unused,
        /// In the word.
        Hit,
        /// Not in the word: a life gone.
        Miss,
    }
}

/// The word game as it stands, with the word's clue.
pub fn shabda_view(state: &ShabdaState, clue: Option<&str>) -> ShabdaView {
    let status = state.status();
    let over = status != ShabdaStatus::Playing;
    let tiles = state
        .aksharas()
        .into_iter()
        .zip(state.shown())
        .map(|(akshar, shown)| ShabdaTile {
            missed: over && !shown,
            akshar: (shown || over).then_some(akshar),
        })
        .collect();
    let key = |letter: &char| ShabdaKey {
        letter: letter.to_string(),
        state: if !state.guessed.contains(letter) {
            ShabdaKeyState::Unused
        } else if state.has(*letter) {
            ShabdaKeyState::Hit
        } else {
            ShabdaKeyState::Miss
        },
    };
    ShabdaView {
        tiles,
        clue: clue.map(str::to_owned),
        vowels: VOWELS.iter().map(key).collect(),
        consonants: CONSONANTS.iter().map(key).collect(),
        status,
        lives: MAX_WRONG,
        lives_left: MAX_WRONG.saturating_sub(state.wrong()),
        hint_left: state.hint_left(),
        answer: over.then(|| state.word.clone()).flatten(),
        stats: state.stats.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hidden_until_found_and_all_shown_once_lost() {
        let mut state = ShabdaState::default();
        state.next(&["कमल".to_owned()], 0);
        state.guess('म').unwrap();
        let view = shabda_view(&state, Some("A flower that blooms in mud"));
        assert_eq!(view.tiles[0].akshar, None);
        assert_eq!(view.tiles[1].akshar.as_deref(), Some("म"));
        assert_eq!(view.answer, None);
        let m = view.consonants.iter().find(|k| k.letter == "म").unwrap();
        assert_eq!(m.state, ShabdaKeyState::Hit);

        for letter in ['ख', 'ग', 'घ', 'च', 'छ', 'ज'] {
            state.guess(letter).unwrap();
        }
        let lost = shabda_view(&state, None);
        assert_eq!(lost.status, ShabdaStatus::Lost);
        assert_eq!(lost.lives_left, 0);
        assert!(lost.tiles[0].missed && !lost.tiles[1].missed);
        assert_eq!(lost.tiles[0].akshar.as_deref(), Some("क"));
        assert_eq!(lost.answer.as_deref(), Some("कमल"));
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

pub use kata_view::*;

mod kata_view {
    use sajilo_core::games::katakuti::{
        KataLevel, KataMark, KataOutcome, KataState, KataStats, turn, winner,
    };

    dto! {
        pub struct KataGameView {
            /// Nine cells, row by row.
            pub cells: Vec<Option<KataMark>>,
            pub player: KataMark,
            pub level: KataLevel,
            /// Whether it is the player's move.
            pub your_turn: bool,
            /// The computer's last move.
            pub last: Option<u8>,
            pub outcome: Option<KataOutcome>,
            /// The three in a row, once there is one.
            pub line: Option<Vec<u8>>,
        }

        pub struct KataView {
            pub game: Option<KataGameView>,
            pub stats: KataStats,
            /// Whether the computer opens the next game.
            pub computer_starts: bool,
        }
    }

    pub fn kata_view(state: &KataState) -> KataView {
        KataView {
            game: state.game.as_ref().map(|game| {
                let outcome = game.outcome();
                KataGameView {
                    cells: game.board.to_vec(),
                    player: game.player,
                    level: game.level,
                    your_turn: outcome.is_none() && turn(&game.board) == game.player,
                    last: game.last.map(|cell| cell as u8),
                    outcome,
                    line: winner(&game.board).map(|(_, line)| line.map(|c| c as u8).to_vec()),
                }
            }),
            stats: state.stats.clone(),
            computer_starts: state.computer_starts,
        }
    }
}

pub use saap_view::*;

mod saap_view {
    use sajilo_core::games::saap_sidhi::{
        LADDERS, SNAKES, SaapMove, SaapSide, SaapState, SaapStats,
    };

    dto! {
        /// A ladder or a snake: from where it starts to where it leaves you.
        pub struct SaapJump {
            pub from: u8,
            pub to: u8,
        }

        pub struct SaapGameView {
            /// Squares: 0 is off the board.
            pub you: u8,
            pub computer: u8,
            pub your_turn: bool,
            pub winner: Option<SaapSide>,
        }

        pub struct SaapView {
            pub game: Option<SaapGameView>,
            pub ladders: Vec<SaapJump>,
            pub snakes: Vec<SaapJump>,
            /// The moves just made, in order, for the screen to replay.
            pub moves: Vec<SaapMove>,
            pub stats: SaapStats,
            pub computer_starts: bool,
        }
    }

    /// The game as it stands, with `moves` just played.
    pub fn saap_view(state: &SaapState, moves: Vec<SaapMove>) -> SaapView {
        let jumps = |list: &[(u8, u8)]| {
            list.iter()
                .map(|(from, to)| SaapJump {
                    from: *from,
                    to: *to,
                })
                .collect()
        };
        SaapView {
            game: state.game.as_ref().map(|game| SaapGameView {
                you: game.you,
                computer: game.computer,
                your_turn: game.winner.is_none() && game.turn == SaapSide::You,
                winner: game.winner,
            }),
            ladders: jumps(&LADDERS),
            snakes: jumps(&SNAKES),
            moves,
            stats: state.stats.clone(),
            computer_starts: state.computer_starts,
        }
    }
}
