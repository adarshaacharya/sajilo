//! Games. The rules live in `sajilo_core::games`; here each game's state is
//! kept in the store, so a puzzle left halfway is there next time, and its
//! record stays on this computer.

use sajilo_api::games::{
    BaghView, QuizDaily, QuizView, ShabdaView, SudokuView, bagh_view, quiz_daily as daily_view,
    quiz_view, shabda_view, sudoku_view,
};
use sajilo_core::calendar::bikram_sambat::nepali_date_from;
use sajilo_core::config::Pack;
use sajilo_core::config::quiz::{QuizCategory, QuizPack};
use sajilo_core::config::words::WordsPack;
use sajilo_core::focus::Language;
use sajilo_core::games::bagh_chal::{BaghGame, BaghLevel, BaghPiece, BaghState};
use sajilo_core::games::quiz::QuizState;
use sajilo_core::games::shabda::{self, GuessError, ShabdaState};
use sajilo_core::games::sudoku::{SudokuGame, SudokuLevel, SudokuState};
use sajilo_core::{NepaliDate, nepal_time};
use tauri::{AppHandle, Wry};

use crate::{db, prefs};

const SHABDA_KEY: &str = "games.shabda.v1";

fn load(app: &AppHandle<Wry>) -> ShabdaState {
    db::get_json(app, SHABDA_KEY)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle<Wry>, state: &ShabdaState) {
    if let Ok(value) = serde_json::to_value(state) {
        let _ = db::set_json(app, SHABDA_KEY, &value);
    }
}

/// Today in Nepal, its puzzle number and its answer. Before the first
/// puzzle (a clock set back) it is puzzle #1.
fn today() -> Result<(NepaliDate, u32, String), String> {
    let day = nepali_date_from(nepal_time::today()).map_err(|e| e.to_string())?;
    let number = shabda::number(day).unwrap_or(1);
    let pack = WordsPack::active();
    let answer = shabda::answer(number, &pack.answers)
        .cloned()
        .ok_or("No words to play today.")?;
    Ok((day, number, answer))
}

/// Today's puzzle, with any guesses already made.
#[tauri::command]
pub fn shabda_today(app: AppHandle<Wry>) -> Result<ShabdaView, String> {
    let (day, number, answer) = today()?;
    let mut state = load(&app);
    state.open(day);
    save(&app, &state);
    Ok(shabda_view(&state, day, number, &answer))
}

/// What `text` reads as, letter by letter, for the tiles while typing. English
/// letters are read as Nepali the way the typing tool reads them: "kalam" is
/// कलम.
#[tauri::command]
pub fn shabda_letters(text: String) -> Vec<String> {
    let word = sajilo_core::tools::nepali::transliterate(text.trim(), true);
    shabda::aksharas(&word).unwrap_or_default()
}

/// Plays a guess, typed in Nepali or in English letters.
#[tauri::command]
pub fn shabda_guess(app: AppHandle<Wry>, text: String) -> Result<ShabdaView, String> {
    let (day, number, answer) = today()?;
    let nepali = prefs::language(&app) == Language::Ne;
    let word = sajilo_core::tools::nepali::transliterate(text.trim(), true);
    let mut state = load(&app);
    state
        .guess(day, &word, &answer)
        .map_err(|error| message(&error, nepali))?;
    save(&app, &state);
    Ok(shabda_view(&state, day, number, &answer))
}

fn message(error: &GuessError, nepali: bool) -> String {
    let (en, ne) = match error {
        GuessError::NotDevanagari => (
            "Type a Nepali word, in Nepali or English letters.".to_owned(),
            "नेपाली शब्द लेख्नुहोस्, नेपाली वा अङ्ग्रेजी अक्षरमा।".to_owned(),
        ),
        GuessError::WrongLength(n) => (
            format!("That's {n} letters; the word has {}.", shabda::LENGTH),
            format!("यो {n} अक्षर भयो; शब्दमा {} अक्षर छन्।", shabda::LENGTH),
        ),
        GuessError::AlreadyGuessed => (
            "Already tried that one.".to_owned(),
            "त्यो पहिले नै प्रयास गरिसक्नुभयो।".to_owned(),
        ),
        GuessError::Finished => (
            "Today's puzzle is done. A new one comes tomorrow.".to_owned(),
            "आजको पजल सकियो। भोलि नयाँ आउँछ।".to_owned(),
        ),
    };
    if nepali { ne } else { en }
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
        let player = game.player;
        state.stats.record(player, outcome);
    }
    store(&app, BAGH_KEY, &state);
    bagh_view(&state)
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
