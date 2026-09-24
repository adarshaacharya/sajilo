//! The small floating card every reminder can arrive as: a break from Focus,
//! or a festival, day plan, Keeper, IPO or SIP reminder.
//!
//! Each kind has its own window label and its own page, but they share
//! everything about the window itself — where it opens, that it never takes
//! the keyboard, and where the user last dragged it. Only one card is on
//! screen at a time: whichever comes second waits for the first to close, so
//! two cards never stack on the same spot.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent, Wry};

use crate::db;

/// Every card's width, in logical pixels; the page fits the height to what it
/// holds.
pub const WIDTH: f64 = 380.0;
const HEIGHT: f64 = 114.0;
/// Space between the card and the screen edge it sits against.
const MARGIN: f64 = 14.0;
/// Where the user last dragged a card, in logical pixels. One spot for every
/// kind of card: somewhere the user chose to look is where they will look.
/// The key predates reminder cards, which is why it says focus.
const PLACE_KEY: &str = "focus.cardPosition.v1";

/// The window labels of every kind of card.
pub const BREAK: &str = "break";
pub const REMINDER: &str = "reminder";
const ALL: [&str; 2] = [BREAK, REMINDER];

/// Whether any card is on screen now.
pub fn any_open(app: &AppHandle<Wry>) -> bool {
    ALL.iter()
        .any(|label| app.get_webview_window(label).is_some())
}

/// Opens a card at the top of the screen, without taking focus: a reminder
/// that grabbed the keyboard would swallow whatever was being typed.
///
/// `surface` is the page's `?surface=` value. When the card closes, whichever
/// card was waiting gets its turn.
pub fn open(app: &AppHandle<Wry>, label: &str, surface: &str, title: &str) {
    let mut builder = WebviewWindowBuilder::new(
        app,
        label,
        WebviewUrl::App(format!("index.html?surface={surface}").into()),
    )
    .title(title)
    .inner_size(WIDTH, HEIGHT)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .shadow(true)
    .focused(false);
    if let Some(place) = remembered_place(app).or_else(|| default_place(app)) {
        builder = builder.position(place.x, place.y);
    }
    match builder.build() {
        Ok(window) => {
            let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
            #[cfg(target_os = "macos")]
            crate::window::polish_macos_chrome(&window);
            // Dragged somewhere else, it opens there next time. A drag
            // reports every step, so the latest spot is kept in memory and
            // written once, when the card closes.
            let handle = app.clone();
            let scale = window.scale_factor().unwrap_or(1.0);
            let dragged_to = Mutex::new(None::<Place>);
            window.on_window_event(move |event| match event {
                WindowEvent::Moved(position) => {
                    let place = Place {
                        x: f64::from(position.x) / scale,
                        y: f64::from(position.y) / scale,
                    };
                    if let Ok(mut latest) = dragged_to.lock() {
                        *latest = Some(place);
                    }
                }
                WindowEvent::Destroyed => {
                    if let Some(place) = dragged_to.lock().ok().and_then(|latest| *latest)
                        && let Ok(value) = serde_json::to_value(place)
                    {
                        let _ = db::set_json(&handle, PLACE_KEY, &value);
                    }
                    // Off the window's own event, so the next card is built
                    // outside this callback rather than inside it.
                    let next = handle.clone();
                    tauri::async_runtime::spawn(async move { show_waiting(&next) });
                }
                _ => {}
            });
        }
        Err(error) => eprintln!("sajilo: could not open the {label} card: {error}"),
    }
}

/// Lets a card that was held back while another was showing come up now.
fn show_waiting(app: &AppHandle<Wry>) {
    crate::commands::reminder_card::show(app);
    crate::commands::focus::sync_card(app);
}

/// A remembered card position, in logical pixels.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
struct Place {
    x: f64,
    y: f64,
}

/// The last place a card was dragged to, if a connected screen still shows
/// it: a spot on a monitor since unplugged falls back to the default.
fn remembered_place(app: &AppHandle<Wry>) -> Option<Place> {
    let place: Place = db::get_json(app, PLACE_KEY)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())?;
    let monitors = app.available_monitors().ok()?;
    let visible = monitors.iter().any(|monitor| {
        let scale = monitor.scale_factor();
        let area = monitor.work_area();
        let left = f64::from(area.position.x) / scale;
        let top = f64::from(area.position.y) / scale;
        let right = left + f64::from(area.size.width) / scale;
        let bottom = top + f64::from(area.size.height) / scale;
        // Enough of the card to grab it again, not just a sliver.
        place.x >= left - WIDTH / 2.0
            && place.x + WIDTH / 2.0 <= right
            && place.y >= top
            && place.y + 40.0 <= bottom
    });
    visible.then_some(place)
}

/// Top centre, just under the menu bar or panel; bottom centre on Windows,
/// just above the taskbar. The right-hand corner is where the system stacks
/// its own notifications, which would cover the card. Logical pixels, from the
/// primary monitor's work area so the card never sits under a bar.
fn default_place(app: &AppHandle<Wry>) -> Option<Place> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let left = f64::from(area.position.x) / scale;
    let top = f64::from(area.position.y) / scale;
    let width = f64::from(area.size.width) / scale;
    let height = f64::from(area.size.height) / scale;
    let x = left + (width - WIDTH) / 2.0;
    let y = if cfg!(target_os = "windows") {
        top + height - HEIGHT - MARGIN
    } else {
        top + MARGIN
    };
    Some(Place { x, y })
}
