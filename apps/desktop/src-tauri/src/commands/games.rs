//! Games. The rules live in `sajilo_core::games`; here each game's state is
//! kept in the store, so a puzzle left halfway is there next time, and its
//! record stays on this computer.

use sajilo_api::games::{
    BaghView, KataView, QuizDaily, QuizView, SaapView, ShabdaView, SudokuView, bagh_view,
    kata_view, quiz_daily as daily_view, quiz_view, saap_view, shabda_view, sudoku_view,
};
use sajilo_core::config::Pack;
use sajilo_core::config::quiz::{QuizCategory, QuizPack};
use sajilo_core::config::words::WordsPack;
use sajilo_core::focus::Language;
use sajilo_core::games::bagh_chal::{BaghGame, BaghLevel, BaghPiece, BaghState};
use sajilo_core::games::katakuti::{KataLevel, KataState};
use sajilo_core::games::quiz::QuizState;
use sajilo_core::games::saap_sidhi::SaapState;
use sajilo_core::games::shabda::{GuessError, HintError, ShabdaState};
use sajilo_core::games::sudoku::{SudokuGame, SudokuLevel, SudokuState};
use sajilo_core::nepal_time;
use tauri::{AppHandle, Wry};

use crate::{db, prefs};

/// The word game's state. A new key: the daily puzzle's state before it
/// has nothing a word found letter by letter can use.
const SHABDA_KEY: &str = "games.shabda.v2";

/// The word game, with a word to play: the one under way, or a new one.
fn shabda_state(app: &AppHandle<Wry>) -> ShabdaState {
    let mut state: ShabdaState = stored(app, SHABDA_KEY);
    if state.word.is_none() {
        state.next(&WordsPack::active().answers, seed());
        store(app, SHABDA_KEY, &state);
    }
    state
}

fn shabda_save(app: &AppHandle<Wry>, state: &ShabdaState) -> ShabdaView {
    store(app, SHABDA_KEY, state);
    let nepali = prefs::language(app) == Language::Ne;
    let pack = WordsPack::active();
    let clue = state
        .word
        .as_deref()
        .and_then(|word| pack.clue(word, nepali));
    shabda_view(state, clue)
}

/// The word under way, or a new one.
#[tauri::command]
pub fn shabda_get(app: AppHandle<Wry>) -> ShabdaView {
    let state = shabda_state(&app);
    shabda_save(&app, &state)
}

/// Tries one letter of the pad.
#[tauri::command]
pub fn shabda_letter(app: AppHandle<Wry>, letter: String) -> Result<ShabdaView, String> {
    let mut state = shabda_state(&app);
    let nepali = prefs::language(&app) == Language::Ne;
    let mut chars = letter.trim().chars();
    let (Some(c), None) = (chars.next(), chars.next()) else {
        return Err(message(&GuessError::NotALetter, nepali));
    };
    state.guess(c).map_err(|error| message(&error, nepali))?;
    Ok(shabda_save(&app, &state))
}

/// Shows one more akshar of the word, for a life.
#[tauri::command]
pub fn shabda_hint(app: AppHandle<Wry>) -> Result<ShabdaView, String> {
    let mut state = shabda_state(&app);
    let nepali = prefs::language(&app) == Language::Ne;
    state.hint().map_err(|error| {
        let (en, ne) = match error {
            HintError::Finished => ("This word is done.", "यो शब्द सकियो।"),
            HintError::NoneLeft => ("No hint left for this word.", "यो शब्दका लागि सङ्केत बाँकी छैन।"),
        };
        if nepali { ne } else { en }.to_owned()
    })?;
    Ok(shabda_save(&app, &state))
}

/// The next word. One left unfinished counts as lost.
#[tauri::command]
pub fn shabda_next(app: AppHandle<Wry>) -> ShabdaView {
    let mut state = shabda_state(&app);
    state.next(&WordsPack::active().answers, seed());
    shabda_save(&app, &state)
}

fn message(error: &GuessError, nepali: bool) -> String {
    let (en, ne) = match error {
        GuessError::NotALetter => (
            "Pick a Nepali letter from the pad.",
            "प्याडबाट एउटा नेपाली अक्षर छान्नुहोस्।",
        ),
        GuessError::AlreadyGuessed => ("Already tried that one.", "त्यो पहिले नै प्रयास गरिसक्नुभयो।"),
        GuessError::Finished => ("This word is done.", "यो शब्द सकियो।"),
    };
    if nepali { ne } else { en }.to_owned()
}

const QUIZ_KEY: &str = "games.quiz.v1";

fn quiz_state(app: &AppHandle<Wry>) -> QuizState {
    db::get_json(app, QUIZ_KEY)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

fn quiz_save(app: &AppHandle<Wry>, state: &QuizState) -> QuizView {
    if let Ok(value) = serde_json::to_value(state) {
        let _ = db::set_json(app, QUIZ_KEY, &value);
    }
    quiz_view(
        state,
        &QuizPack::active(),
        prefs::language(app) == Language::Ne,
    )
}

/// The quiz as it stands: a round under way, or the topics to start one.
#[tauri::command]
pub fn quiz_get(app: AppHandle<Wry>) -> QuizView {
    let state = quiz_state(&app);
    quiz_save(&app, &state)
}

/// A new round of ten, from one topic or all of them.
#[tauri::command]
pub fn quiz_start(app: AppHandle<Wry>, topic: Option<QuizCategory>) -> QuizView {
    let mut state = quiz_state(&app);
    let seed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos() as u64);
    state.start(&QuizPack::active(), topic, seed);
    quiz_save(&app, &state)
}

/// Answers the question on screen with the option at `place`.
#[tauri::command]
pub fn quiz_answer(app: AppHandle<Wry>, place: u8) -> Result<QuizView, String> {
    let mut state = quiz_state(&app);
    state
        .answer(&QuizPack::active(), place)
        .map_err(|e| format!("{e:?}"))?;
    Ok(quiz_save(&app, &state))
}

#[tauri::command]
pub fn quiz_next(app: AppHandle<Wry>) -> QuizView {
    let mut state = quiz_state(&app);
    state.next(&QuizPack::active());
    quiz_save(&app, &state)
}

/// Leaves the round; what was answered stays seen.
#[tauri::command]
pub fn quiz_quit(app: AppHandle<Wry>) -> QuizView {
    let mut state = quiz_state(&app);
    state.round = None;
    quiz_save(&app, &state)
}

const SUDOKU_KEY: &str = "games.sudoku.v1";
const BAGH_KEY: &str = "games.baghChal.v1";

fn stored<T: serde::de::DeserializeOwned + Default>(app: &AppHandle<Wry>, key: &str) -> T {
    db::get_json(app, key)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

fn store<T: serde::Serialize>(app: &AppHandle<Wry>, key: &str, value: &T) {
    if let Ok(value) = serde_json::to_value(value) {
        let _ = db::set_json(app, key, &value);
    }
}

fn seed() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos() as u64)
}

#[tauri::command]
pub fn sudoku_get(app: AppHandle<Wry>) -> SudokuView {
    sudoku_view(&stored::<SudokuState>(&app, SUDOKU_KEY))
}

/// A fresh puzzle at `level`; one left unfinished is dropped.
#[tauri::command]
pub fn sudoku_new(app: AppHandle<Wry>, level: SudokuLevel) -> SudokuView {
    let mut state: SudokuState = stored(&app, SUDOKU_KEY);
    state.game = Some(SudokuGame::new(level, seed(), chrono::Utc::now()));
    store(&app, SUDOKU_KEY, &state);
    sudoku_view(&state)
}

/// Puts `digit` in `cell`, 0 to clear. Solving it records the time.
#[tauri::command]
pub fn sudoku_set(app: AppHandle<Wry>, cell: u32, digit: u8) -> SudokuView {
    let mut state: SudokuState = stored(&app, SUDOKU_KEY);
    if let Some(game) = state.game.as_mut()
        && game.set(cell as usize, digit, chrono::Utc::now())
        && let Some(seconds) = game.solved_in
    {
        let level = game.level;
        state.stats.record(level, seconds);
    }
    store(&app, SUDOKU_KEY, &state);
    sudoku_view(&state)
}

#[tauri::command]
pub fn bagh_get(app: AppHandle<Wry>) -> BaghView {
    bagh_view(&stored::<BaghState>(&app, BAGH_KEY))
}

/// A new game with the player on `player`'s side.
#[tauri::command]
pub fn bagh_new(app: AppHandle<Wry>, player: BaghPiece, level: BaghLevel) -> BaghView {
    let mut state: BaghState = stored(&app, BAGH_KEY);
    state.game = Some(BaghGame::new(player, level, seed()));
    store(&app, BAGH_KEY, &state);
    bagh_view(&state)
}

/// The player's move and the computer's answer. A game that ends counts
/// once in the record.
#[tauri::command]
pub fn bagh_play(app: AppHandle<Wry>, from: Option<u8>, to: u8) -> BaghView {
    let mut state: BaghState = stored(&app, BAGH_KEY);
    if let Some(game) = state.game.as_mut()
        && game.board.outcome().is_none()
        && game.play(from, to)
        && let Some(outcome) = game.board.outcome()
    {
        let (player, level) = (game.player, game.level);
        state.stats.record(player, level, outcome);
    }
    store(&app, BAGH_KEY, &state);
    bagh_view(&state)
}

const KATA_KEY: &str = "games.katakuti.v1";

#[tauri::command]
pub fn kata_get(app: AppHandle<Wry>) -> KataView {
    kata_view(&stored::<KataState>(&app, KATA_KEY))
}

/// A new game at `level`; who opens alternates.
#[tauri::command]
pub fn kata_new(app: AppHandle<Wry>, level: KataLevel) -> KataView {
    let mut state: KataState = stored(&app, KATA_KEY);
    state.start(level, seed());
    store(&app, KATA_KEY, &state);
    kata_view(&state)
}

/// The player's move at `cell` and the computer's answer.
#[tauri::command]
pub fn kata_play(app: AppHandle<Wry>, cell: u8) -> KataView {
    let mut state: KataState = stored(&app, KATA_KEY);
    state.play(usize::from(cell));
    store(&app, KATA_KEY, &state);
    kata_view(&state)
}

const SAAP_KEY: &str = "games.saapSidhi.v1";

/// A fair die for the board game, seeded from the clock.
fn die() -> impl FnMut() -> u8 {
    let mut state = seed();
    move || {
        state = state
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        ((state >> 33) % 6) as u8 + 1
    }
}

#[tauri::command]
pub fn saap_get(app: AppHandle<Wry>) -> SaapView {
    saap_view(&stored::<SaapState>(&app, SAAP_KEY), Vec::new())
}

/// A new game; who rolls first alternates, and the computer's opening
/// rolls come back to replay.
#[tauri::command]
pub fn saap_new(app: AppHandle<Wry>) -> SaapView {
    let mut state: SaapState = stored(&app, SAAP_KEY);
    let moves = state.start(&mut die());
    store(&app, SAAP_KEY, &state);
    saap_view(&state, moves)
}

/// The player's roll and the computer's answer, every move in order.
#[tauri::command]
pub fn saap_roll(app: AppHandle<Wry>) -> SaapView {
    let mut state: SaapState = stored(&app, SAAP_KEY);
    let moves = state.play(&mut die());
    store(&app, SAAP_KEY, &state);
    saap_view(&state, moves)
}

/// Today in Nepal, as a day count: a new day, a new question.
fn quiz_day() -> i64 {
    nepal_time::today()
        .signed_duration_since(chrono::NaiveDate::default())
        .num_days()
}

fn daily_enabled(app: &AppHandle<Wry>) -> bool {
    crate::commands::notify::options(app).daily_quiz
}

/// The question of the day, picked now if it hasn't been.
#[tauri::command]
pub fn quiz_daily(app: AppHandle<Wry>) -> Option<QuizDaily> {
    let mut state = quiz_state(&app);
    let pack = QuizPack::active();
    state.daily(&pack, quiz_day());
    quiz_save(&app, &state);
    daily_view(
        &state,
        &pack,
        prefs::language(&app) == Language::Ne,
        daily_enabled(&app),
    )
}

/// Answers the question of the day; it then counts as seen in the quiz.
#[tauri::command]
pub fn quiz_daily_answer(app: AppHandle<Wry>, place: u8) -> Option<QuizDaily> {
    let mut state = quiz_state(&app);
    let pack = QuizPack::active();
    state.daily(&pack, quiz_day());
    let _ = state.answer_daily(&pack, place);
    quiz_save(&app, &state);
    daily_view(
        &state,
        &pack,
        prefs::language(&app) == Language::Ne,
        daily_enabled(&app),
    )
}

/// Turns the daily question card on or off, from the quiz screen.
#[tauri::command]
pub fn quiz_daily_enable(app: AppHandle<Wry>, enabled: bool) -> Result<(), String> {
    let mut options = crate::commands::notify::options(&app);
    options.daily_quiz = enabled;
    let value = serde_json::to_value(options).map_err(|e| e.to_string())?;
    db::set_json(&app, prefs::NOTIFICATION_OPTIONS, &value)?;
    crate::commands::notify::reschedule();
    Ok(())
}

/// The question of the day as a reminder card at noon, until it is
/// answered. Quiet hours and pauses apply as to any reminder.
pub fn pending_notifications(
    app: &AppHandle<Wry>,
    now: chrono::DateTime<chrono::Utc>,
) -> Vec<sajilo_core::notify::PlannedNotification> {
    let mut state = quiz_state(app);
    let pack = QuizPack::active();
    let Some(daily) = state.daily(&pack, quiz_day()).cloned() else {
        return Vec::new();
    };
    // Saves the pick so the card and the quiz screen agree.
    let _ = quiz_save(app, &state);
    if daily.chosen.is_some() {
        return Vec::new();
    }
    let Some(fire_at) = sajilo_core::notify::at_nepal_time(nepal_time::today(), DAILY_HOUR, 0)
    else {
        return Vec::new();
    };
    if !sajilo_core::notify::still_deliverable(fire_at, now) {
        return Vec::new();
    }
    let nepali = prefs::language(app) == Language::Ne;
    let question = pack
        .questions
        .iter()
        .find(|q| q.id == daily.id)
        .map(|q| {
            if nepali {
                q.ne.q.clone()
            } else {
                q.en.q.clone()
            }
        })
        .unwrap_or_default();
    vec![sajilo_core::notify::PlannedNotification {
        id: format!("sajilo.quiz.{}", daily.day),
        kind: sajilo_core::notify::ReminderKind::Quiz,
        title: if nepali {
            "आजको प्रश्न"
        } else {
            "Question of the day"
        }
        .to_owned(),
        body: question,
        fire_at,
    }]
}

/// When the daily question comes, Nepal time: after the morning's rush.
const DAILY_HOUR: u32 = 12;
