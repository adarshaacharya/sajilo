//! The tray icon: Sajilo's only permanent presence on screen.

pub mod icon;
#[cfg(target_os = "linux")]
mod linux_host;
pub mod title;
#[cfg(target_os = "linux")]
mod xembed;

use sajilo_core::NepaliDate;
use sajilo_core::numerals::NumeralStyle;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
#[cfg(not(target_os = "linux"))]
use tauri::tray::MouseButtonState;
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::window;

/// The tray's id. On Linux it is also the id the panel knows the icon by, so
/// it names the app there. Elsewhere it stays `main`, as it always was.
pub const ID: &str = if cfg!(target_os = "linux") {
    "sajilo"
} else {
    "main"
};

#[cfg(target_os = "linux")]
const OPEN_LABEL: &str = "Open Sajilo";
#[cfg(target_os = "linux")]
const HIDE_LABEL: &str = "Hide Sajilo";

/// The Linux menu's first item, kept so its label can track the popover.
#[cfg(target_os = "linux")]
struct PopoverItem(MenuItem<tauri::Wry>);

/// Names what the menu item will actually do next.
///
/// The item both opens and dismisses the popover, like a click on the icon. A
/// fixed "Open Sajilo" would be wrong half the time: it would hide a popover
/// that is already up.
///
/// Takes the state being moved *into* rather than reading it back off the
/// window: GTK maps and unmaps asynchronously, so `is_visible` still reports the
/// previous state when called right after `show`/`hide`, which left the label a
/// step behind and naming the wrong action.
#[cfg(target_os = "linux")]
pub fn set_popover_shown(app: &AppHandle, shown: bool) {
    use tauri::Manager as _;

    if host(app) == Some(linux_host::Host::SystemTray) {
        xembed::set_popover_shown(app, shown);
        return;
    }
    let Some(item) = app.try_state::<PopoverItem>() else {
        return;
    };
    let _ = item.0.set_text(popover_label(shown));
}

/// The menu's first item's label: what it will do next.
#[cfg(target_os = "linux")]
fn popover_label(shown: bool) -> &'static str {
    if shown { HIDE_LABEL } else { OPEN_LABEL }
}

/// Which kind of tray icon Linux got, once it has one; see `linux_host`.
#[cfg(target_os = "linux")]
struct ChosenHost(linux_host::Host);

#[cfg(target_os = "linux")]
fn host(app: &AppHandle) -> Option<linux_host::Host> {
    app.try_state::<ChosenHost>().map(|chosen| chosen.0)
}

/// The date row at the top of the tray menu, kept so `refresh_title` can move
/// it forward with the day.
///
/// macOS and Windows only: Linux's menu is a toggle item and Quit (see
/// `build`), so there is no date row to move there. The date rides the label
/// beside the icon instead.
struct DateItem(MenuItem<Wry>);

/// "Restart to update", which sits in the menu only while an installed update
/// is waiting for a restart. Menu items cannot be hidden, so it is inserted and
/// removed; `shown` records which of the two it last was.
struct UpdateEntry {
    menu: Menu<Wry>,
    item: MenuItem<Wry>,
    #[cfg(not(target_os = "linux"))]
    separator: PredefinedMenuItem<Wry>,
    shown: std::sync::Mutex<bool>,
}

/// Shows the restart item with `label`, or takes it away with `None`.
///
/// The words come from the frontend, which knows the chosen language; Rust
/// only places them. Placed right under the date on macOS and Windows, where
/// the eye lands first, and after the open item on Linux.
pub fn set_update_ready(app: &AppHandle, label: Option<&str>) {
    #[cfg(target_os = "linux")]
    if host(app) == Some(linux_host::Host::SystemTray) {
        xembed::set_update_ready(app, label.map(str::to_owned));
        return;
    }
    let Some(entry) = app.try_state::<UpdateEntry>() else {
        return;
    };
    let Ok(mut shown) = entry.shown.lock() else {
        return;
    };
    match label {
        Some(label) => {
            let _ = entry.item.set_text(label);
            if !*shown {
                // After the date row and its separator; after the one open
                // item on Linux.
                #[cfg(not(target_os = "linux"))]
                {
                    let _ = entry.menu.insert(&entry.item, 2);
                    let _ = entry.menu.insert(&entry.separator, 3);
                }
                #[cfg(target_os = "linux")]
                let _ = entry.menu.insert(&entry.item, 1);
                *shown = true;
            }
        }
        None if *shown => {
            let _ = entry.menu.remove(&entry.item);
            #[cfg(not(target_os = "linux"))]
            let _ = entry.menu.remove(&entry.separator);
            *shown = false;
        }
        None => {}
    }
}

/// Puts Sajilo in the tray.
///
/// On Linux, first works out which kind of tray icon the desktop's tray gives
/// a left click to (see `linux_host`), which can mean waiting for the panel
/// at login; the icon appears once it is up.
pub fn build(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(target_os = "linux")]
    {
        let handle = app.clone();
        std::thread::spawn(move || {
            let chosen = linux_host::wait_for_host();
            let app = handle.clone();
            let _ = handle.run_on_main_thread(move || start_linux(&app, chosen));
        });
        spawn_midnight_rollover(app.clone());
        Ok(())
    }
    #[cfg(not(target_os = "linux"))]
    {
        build_tray_icon(app)?;
        refresh_title(app);
        spawn_midnight_rollover(app.clone());
        Ok(())
    }
}

/// Builds the kind of icon `linux_host` chose. Main thread.
#[cfg(target_os = "linux")]
fn start_linux(app: &AppHandle, chosen: linux_host::Host) {
    app.manage(ChosenHost(chosen));
    match chosen {
        linux_host::Host::StatusNotifier => {
            if let Err(err) = build_tray_icon(app) {
                eprintln!("sajilo: could not build the tray icon: {err}");
                return;
            }
        }
        linux_host::Host::SystemTray => {
            xembed::start(app);
            xembed::watch_for_new_tray(app.clone());
        }
    }
    refresh_title(app);
}

/// Tauri's tray icon: macOS's menu-bar item, Windows' notification-area
/// icon, and on Linux the StatusNotifierItem.
fn build_tray_icon(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(not(target_os = "linux"))]
    let date = MenuItem::with_id(
        app,
        "open",
        label(app).unwrap_or_else(|| "Sajilo".to_owned()),
        true,
        None::<&str>,
    )?;
    #[cfg(not(target_os = "linux"))]
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
    #[cfg(not(target_os = "linux"))]
    let quit = MenuItem::with_id(app, "quit", "Quit Sajilo", true, Some("CmdOrCtrl+Q"))?;

    // Linux gets a short menu: open (or hide) Sajilo, then Quit.
    //
    // A left click on the icon opens the popover directly: the tray is a
    // StatusNotifierItem (ksni, see vendor/ksni/PATCHED.md) and the panel
    // calls its `Activate`. The menu is the right-click. GNOME's AppIndicator
    // extension opens the menu on a single left click instead, for every app,
    // so GNOME gets the System Tray icon (see `linux_host`); where it still
    // hosts this one (its System Tray turned off, or GTK on Wayland), the
    // menu leading with Open is what a click finds. Settings stays in the
    // popover's header.
    //
    // macOS and Windows keep the full menu: there, left click toggles the
    // popover and this menu is the right-click affordance.
    #[cfg(target_os = "linux")]
    let open = MenuItem::with_id(app, "open", OPEN_LABEL, true, None::<&str>)?;

    // Quit too: the tray menu is where people look to close a tray app.
    #[cfg(target_os = "linux")]
    let quit = MenuItem::with_id(app, "quit", "Quit Sajilo", true, None::<&str>)?;
    #[cfg(target_os = "linux")]
    let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit])?;

    // Kept so the label can follow the popover; see `set_popover_shown`.
    #[cfg(target_os = "linux")]
    app.manage(PopoverItem(open));
    #[cfg(not(target_os = "linux"))]
    let menu = Menu::with_items(
        app,
        &[
            &date,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    #[cfg(not(target_os = "linux"))]
    app.manage(DateItem(date));
    app.manage(UpdateEntry {
        menu: menu.clone(),
        item: MenuItem::with_id(
            app,
            "update-restart",
            "Restart to update",
            true,
            None::<&str>,
        )?,
        #[cfg(not(target_os = "linux"))]
        separator: PredefinedMenuItem::separator(app)?,
        shown: std::sync::Mutex::new(false),
    });

    #[cfg_attr(target_os = "macos", allow(unused_mut))]
    let mut builder = TrayIconBuilder::with_id(ID);

    // macOS carries the date as the tray *title*, like the Swift app did, so it
    // needs no glyph — the app icon is a filled square and a template render of
    // it is an unreadable blob. Elsewhere the tray starts from the app icon,
    // and `refresh_title` swaps in the Nepal flag if Settings asks for it.
    // Linux always needs one: GNOME draws the label beside an icon, never on
    // its own.
    #[cfg(not(target_os = "macos"))]
    {
        builder = builder
            .icon(app.default_window_icon().cloned().ok_or_else(|| {
                tauri::Error::AssetNotFound("no default window icon to use for the tray".into())
            })?)
            .icon_as_template(true);
    }

    builder
        .tooltip("Sajilo")
        // Left click toggles the popover; the menu is the right-click
        // affordance. Where GNOME's extension hosts it, a single left click
        // opens the menu, which is why the menu leads with the date or Open.
        .show_menu_on_left_click(false)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            // The date row on macOS and Windows; Open or Hide on Linux.
            "open" => window::toggle(app),
            "settings" => open_settings(app),
            // The update is already installed; a restart is all that is left.
            "update-restart" => app.restart(),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // The positioner needs every tray event to keep track of where the
            // icon actually is.
            tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
            #[cfg(target_os = "windows")]
            if let TrayIconEvent::Click { position, .. } = &event {
                window::remember_tray_click(*position);
            }

            // macOS and Windows report the press and the release; see
            // `window::tray_press` for why both count.
            #[cfg(not(target_os = "linux"))]
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state,
                ..
            } = event
            {
                match button_state {
                    MouseButtonState::Down => window::tray_press(tray.app_handle()),
                    MouseButtonState::Up => window::tray_release(tray.app_handle()),
                }
            }
            // Linux reports one event per click, the panel's `Activate`, on
            // the release; see `window::tray_click_on_linux`.
            #[cfg(target_os = "linux")]
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } = event
            {
                window::tray_click_on_linux(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// Today's date, the numeral style to draw it in, and the text the tray
/// carries: the date in the configured format, plus the clock when that
/// preference is on. `None` only when today falls outside the bundled calendar
/// range.
fn today(app: &AppHandle) -> Option<(NepaliDate, NumeralStyle, String)> {
    let date = title::today()?;
    #[cfg_attr(not(target_os = "linux"), allow(unused_mut))]
    let (mut format, numerals, mut custom, show_time) = crate::prefs::tray_preferences(app);
    // Linux draws the flag icon right beside the text, so the text leaves out
    // its own flag rather than show two. Windows shows no text, and macOS no
    // icon, so both keep the format as chosen.
    #[cfg(target_os = "linux")]
    if crate::prefs::tray_icon_is_flag(app) {
        if matches!(format, title::MenuBarFormat::NepaliFlag) {
            format = title::MenuBarFormat::NepaliShort;
        }
        custom.show_flag = false;
    }
    let mut label = title::title(date, format, numerals, custom);
    if show_time {
        label = format!(
            "{label} · {}",
            title::clock(sajilo_core::nepal_time::now(), numerals)
        );
    }
    Some((date, numerals, label))
}

/// The tray menu's date row, for the one call that needs the text alone.
#[cfg(not(target_os = "linux"))]
fn label(app: &AppHandle) -> Option<String> {
    today(app).map(|(.., label)| label)
}

/// Redraws the tray label from the current date and preferences.
pub fn refresh_title(app: &AppHandle) {
    let Some((date, numerals, label)) = today(app) else {
        return;
    };
    // Linux's System Tray icon has no room for text: the date is its tooltip.
    #[cfg(target_os = "linux")]
    if host(app) == Some(linux_host::Host::SystemTray) {
        set_system_tray_picture(app);
        xembed::set_tooltip(app, label);
        return;
    }
    let Some(tray) = app.tray_by_id(ID) else {
        return;
    };
    // The full date is conveyed in the native title/menu/tooltip. Windows'
    // visible tray glyph is a static Nepal flag, so it has no date fields.
    let _ = (date, numerals);

    // The menu's date row moves with the day where it exists; Linux has no such
    // row (its menu is the toggle item) and carries the date in the label below.
    if let Some(item) = app.try_state::<DateItem>() {
        let _ = item.0.set_text(&label);
    }

    // macOS renders text beside the tray icon natively. On Linux the title is
    // also the Ayatana label, which GNOME's AppIndicator extension draws beside
    // the icon when it hosts this kind; KDE and Cinnamon show it as the
    // tooltip.
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    let _ = tray.set_title(Some(&label));

    // Windows and Linux show an icon, the Nepal flag or Sajilo's own, as
    // chosen in Settings. Windows has no tray title, so there the full date
    // stays in the tooltip and the first tray-menu item.
    #[cfg(not(target_os = "macos"))]
    set_icon(app, &tray);

    let _ = tray.set_tooltip(Some(&label));
}

/// Which icon the tray last got: 0 none yet, 1 Sajilo's, 2 the flag.
#[cfg(not(target_os = "macos"))]
static SHOWN_ICON: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);

/// Puts the chosen icon in the tray: the Nepal flag, or Sajilo's app icon.
///
/// Only when the choice changes: the label redraws every minute while it shows
/// the clock, and on Linux each new icon is a file written and reloaded.
#[cfg(not(target_os = "macos"))]
fn set_icon(app: &AppHandle, tray: &tauri::tray::TrayIcon) {
    use std::sync::atomic::Ordering;

    let flag = crate::prefs::tray_icon_is_flag(app);
    let wanted = if flag { 2 } else { 1 };
    if SHOWN_ICON.load(Ordering::SeqCst) == wanted {
        return;
    }
    let image = if flag {
        icon::nepal_flag_icon()
            .map(|pixels| tauri::image::Image::new_owned(pixels, icon::size(), icon::size()))
    } else {
        app.default_window_icon().cloned()
    };
    if let Some(image) = image {
        if tray.set_icon(Some(image)).is_ok() {
            SHOWN_ICON.store(wanted, Ordering::SeqCst);
        }
        let _ = tray.set_icon_as_template(false);
    }
}

/// Puts the chosen icon, the flag or Sajilo's, in the System Tray; like
/// [`set_icon`], only when the choice changes.
#[cfg(target_os = "linux")]
fn set_system_tray_picture(app: &AppHandle) {
    use std::sync::atomic::Ordering;

    let flag = crate::prefs::tray_icon_is_flag(app);
    let wanted = if flag { 2 } else { 1 };
    if SHOWN_ICON.load(Ordering::SeqCst) == wanted {
        return;
    }
    let edge = xembed::source_size();
    let picture = if flag {
        icon::nepal_flag_at(edge).map(|pixels| (pixels, edge, edge))
    } else {
        app.default_window_icon()
            .map(|image| (image.rgba().to_vec(), image.width(), image.height()))
    };
    if let Some((pixels, width, height)) = picture {
        xembed::set_picture(app, pixels, width, height);
        SHOWN_ICON.store(wanted, Ordering::SeqCst);
    }
}

/// Redraws at Kathmandu midnight — or every minute, while the tray also shows
/// the clock.
///
/// Sleeps until the next tick rather than polling, and recomputes the wait
/// each time so it self-corrects after a laptop wakes from sleep having missed
/// one entirely, and so switching the clock on or off is picked up on the very
/// next tick rather than needing a restart.
fn spawn_midnight_rollover(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let now = sajilo_core::nepal_time::now();
            let (.., show_time) = crate::prefs::tray_preferences(&app);
            let wait = if show_time {
                title::seconds_until_next_minute(now)
            } else {
                title::seconds_until_nepal_midnight(now)
            };
            // Tauri's own runtime, so the app does not carry a second one.
            tauri::async_runtime::spawn_blocking(move || {
                std::thread::sleep(std::time::Duration::from_secs(wait as u64));
            })
            .await
            .ok();
            refresh_title(&app);
        }
    });
}

/// Opens the popover and asks the frontend to route to Settings. The route lives
/// in the web layer, so this is a message rather than a navigation.
fn open_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(window::MAIN) {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("sajilo://navigate", "/settings");
    }
}
