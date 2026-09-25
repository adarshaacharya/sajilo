//! Reminder cards: festivals, day plans, Keeper, IPO and SIP reminders shown
//! as the same small card Breaks uses, when Settings says card rather than
//! notification.
//!
//! What is due is decided by `commands::notify`, exactly as for a
//! notification; this file only holds the queue. Reminders that come due
//! together show one after another in the same card, and it stays until each
//! is dealt with — a notification in the corner is gone before it is read.

use std::collections::VecDeque;
use std::sync::Mutex;

use sajilo_core::notify::{PlannedNotification, ReminderKind};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::system::card_window;

/// Tells an open card that the reminder it shows has changed.
const CHANGED_EVENT: &str = "sajilo://reminder-changed";

#[derive(Default)]
pub struct ReminderQueue(Mutex<VecDeque<Queued>>);

struct Queued {
    reminder: PlannedNotification,
    preview: bool,
}

/// What the card shows: the reminder in front, and how many wait behind it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderCardView {
    pub reminder: PlannedNotification,
    pub waiting: usize,
    /// "Show me an example": the real card, reminding of nothing.
    pub preview: bool,
}

fn with_queue<R>(app: &AppHandle<Wry>, change: impl FnOnce(&mut VecDeque<Queued>) -> R) -> R {
    let queue = app.state::<ReminderQueue>();
    let mut guard = queue
        .0
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    change(&mut guard)
}

/// Queues reminders that just came due, with one chime for all of them.
pub fn enqueue(app: &AppHandle<Wry>, reminders: Vec<PlannedNotification>) {
    if reminders.is_empty() {
        return;
    }
    with_queue(app, |queue| {
        queue.extend(reminders.into_iter().map(|reminder| Queued {
            reminder,
            preview: false,
        }));
    });
    crate::system::chime::play(app);
    show(app);
}

/// Opens the card if something is queued and no card is on screen. A break
/// card showing goes first; this one comes up when it closes.
pub fn show(app: &AppHandle<Wry>) {
    let queued = with_queue(app, |queue| !queue.is_empty());
    if queued && !card_window::any_open(app) {
        card_window::open(app, card_window::REMINDER, "reminder", "Sajilo reminder");
    }
}

#[tauri::command]
pub fn current_reminder(app: AppHandle<Wry>) -> Option<ReminderCardView> {
    with_queue(&app, |queue| {
        queue.front().map(|front| ReminderCardView {
            reminder: front.reminder.clone(),
            waiting: queue.len() - 1,
            preview: front.preview,
        })
    })
}

/// The card's buttons. `open` is the screen to show in the popover, for
/// "Open"; either way the reminder is done with, and the next one, if any,
/// takes its place in the same card.
#[tauri::command]
pub fn dismiss_reminder(app: AppHandle<Wry>, open: Option<String>) {
    let (remaining, preview) = with_queue(&app, |queue| {
        let preview = queue.pop_front().is_some_and(|front| front.preview);
        (queue.len(), preview)
    });
    // An example card is not a reminder anyone acted on.
    if !preview {
        crate::commands::telemetry::record(
            &app,
            if open.is_some() {
                "action.reminder-open"
            } else {
                "action.reminder-dismiss"
            },
        );
    }
    if let Some(route) = open
        && let Some(window) = crate::window::main_window(&app)
    {
        crate::window::show(&window);
        let _ = window.emit("sajilo://navigate", route);
    }
    let Some(card) = app.get_webview_window(card_window::REMINDER) else {
        return;
    };
    if remaining > 0 {
        let _ = card.emit(CHANGED_EVENT, ());
    } else {
        card_window::dismiss(&card);
    }
}

/// "Show me an example" in Settings: the next real reminder if one is
/// coming, so the example is about something the user will actually see.
#[tauri::command]
pub fn preview_reminder_card(app: AppHandle<Wry>) {
    let reminder = crate::commands::notify::upcoming(&app)
        .into_iter()
        .next()
        .unwrap_or_else(|| PlannedNotification {
            id: "sajilo.preview".to_owned(),
            kind: ReminderKind::Festival,
            title: "Festival tomorrow".to_owned(),
            body: "This is how a reminder arrives.".to_owned(),
            fire_at: chrono::Utc::now(),
        });
    with_queue(&app, |queue| {
        queue.push_front(Queued {
            reminder,
            preview: true,
        });
    });
    crate::system::chime::play(&app);
    match app.get_webview_window(card_window::REMINDER) {
        Some(card) => {
            let _ = card.emit(CHANGED_EVENT, ());
        }
        None => show(&app),
    }
}
