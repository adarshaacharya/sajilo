//! The Linux tray icon for the trays that give a click straight to the app:
//! GNOME's AppIndicator extension (Ubuntu, Fedora, Pop!_OS), i3bar and
//! polybar.
//!
//! This is the freedesktop System Tray protocol, the older of Linux's two
//! kinds of tray icon: a small window of Sajilo's that the tray takes into
//! itself (XEmbed). A click on it is a click on that window, so one left
//! click opens the popover. GNOME's extension hosts the newer kind, the
//! StatusNotifierItem, too, but opens its menu on a left click for every app;
//! this kind it hands the click to. i3bar and polybar host only this kind.
//!
//! What it cannot do is show text: the tray gives it a small square, so it
//! carries the icon alone, with the date as its tooltip where the tray passes
//! the pointer on (GNOME's does not).
//!
//! X11 only, which covers GNOME on Wayland too: Sajilo draws through XWayland
//! there (see `prefer_x11_backend` in `lib.rs`), and the extension embeds X11
//! icons. See docs/popover-window.md.

use std::cell::RefCell;
use std::ffi::CString;
use std::os::raw::{c_int, c_long, c_ulong};

use gtk::gdk_pixbuf::{Colorspace, InterpType, Pixbuf};
use gtk::prelude::*;
use tauri::AppHandle;
use x11_dl::xlib;

/// `SYSTEM_TRAY_REQUEST_DOCK`, the tray protocol's only request Sajilo sends.
const REQUEST_DOCK: c_long = 0;

/// Edge of the icon before it is scaled into the tray's slot. Large, so a
/// 2× or 3× panel still gets a sharp flag.
const SOURCE_SIZE: u32 = 128;

/// The icon, alive on GTK's main thread.
struct Icon {
    plug: gtk::Plug,
    open: gtk::MenuItem,
    update: gtk::MenuItem,
    picture: Option<Pixbuf>,
    tooltip: String,
}

thread_local! {
    /// GTK objects live on the main thread and are not `Send`, so the icon is
    /// kept here rather than in Tauri's state. Everything that touches it
    /// runs on the main thread (see [`on_main`]).
    static ICON: RefCell<Option<Icon>> = const { RefCell::new(None) };
}

/// A connection of Sajilo's own to the X server, for the tray protocol's few
/// messages. GTK's connection belongs to the main thread; this one is opened
/// wherever it is needed.
struct X {
    lib: xlib::Xlib,
    display: *mut xlib::Display,
    /// `_NET_SYSTEM_TRAY_S<screen>`, the selection the tray owns.
    selection: c_ulong,
}

impl X {
    fn open() -> Option<Self> {
        let lib = xlib::Xlib::open().ok()?;
        // SAFETY: a null name opens `$DISPLAY`; a null result is handled.
        let display = unsafe { (lib.XOpenDisplay)(std::ptr::null()) };
        if display.is_null() {
            return None;
        }
        let mut x = Self {
            lib,
            display,
            selection: 0,
        };
        // SAFETY: `display` is open.
        let screen = unsafe { (x.lib.XDefaultScreen)(x.display) };
        x.selection = x.atom(&format!("_NET_SYSTEM_TRAY_S{screen}"));
        Some(x)
    }

    fn atom(&self, name: &str) -> c_ulong {
        let Ok(name) = CString::new(name) else {
            return 0;
        };
        // SAFETY: `display` is open and `name` is a C string.
        unsafe { (self.lib.XInternAtom)(self.display, name.as_ptr(), 0) }
    }

    /// The tray's window, when there is a tray.
    fn tray(&self) -> Option<c_ulong> {
        // SAFETY: `display` is open.
        let owner = unsafe { (self.lib.XGetSelectionOwner)(self.display, self.selection) };
        (owner != 0).then_some(owner)
    }

    /// Whether the tray draws its icons with an alpha channel, so Sajilo's
    /// icon can have see-through corners. It says so by naming a 32-bit
    /// visual in `_NET_SYSTEM_TRAY_VISUAL`.
    fn tray_has_alpha(&self, tray: c_ulong) -> bool {
        let property = self.atom("_NET_SYSTEM_TRAY_VISUAL");
        let (mut kind, mut format, mut count, mut after) = (0, 0, 0, 0);
        let mut data: *mut u8 = std::ptr::null_mut();
        // SAFETY: every out-pointer is valid; `data` is freed below.
        let read = unsafe {
            (self.lib.XGetWindowProperty)(
                self.display,
                tray,
                property,
                0,
                1,
                0,
                xlib::XA_VISUALID,
                &raw mut kind,
                &raw mut format,
                &raw mut count,
                &raw mut after,
                &raw mut data,
            )
        };
        if read != 0 || data.is_null() {
            return false;
        }
        // SAFETY: a format-32 property is an array of C longs, and `count`
        // says there is at least one. Xlib allocates it with malloc, so it is
        // aligned for them.
        #[allow(clippy::cast_ptr_alignment)]
        let visual = (count > 0 && format == 32).then(|| unsafe { *data.cast::<c_ulong>() });
        // SAFETY: `data` came from Xlib.
        unsafe { (self.lib.XFree)(data.cast()) };
        let Some(visual) = visual else {
            return false;
        };

        let mut wanted: xlib::XVisualInfo = unsafe { std::mem::zeroed() };
        wanted.visualid = visual;
        let mut found: c_int = 0;
        // SAFETY: `wanted` and `found` are valid; the result is freed below.
        let info = unsafe {
            (self.lib.XGetVisualInfo)(
                self.display,
                xlib::VisualIDMask,
                &raw mut wanted,
                &raw mut found,
            )
        };
        if info.is_null() {
            return false;
        }
        // SAFETY: `found` > 0 means `info` points at that many entries.
        let depth = (found > 0).then(|| unsafe { (*info).depth });
        // SAFETY: `info` came from Xlib.
        unsafe { (self.lib.XFree)(info.cast()) };
        depth == Some(32)
    }

    /// Gives `window` the background of whatever it sits in, the tray: X's
    /// `ParentRelative`. GTK has no way to ask for it.
    fn take_parent_background(&self, window: c_ulong) {
        // SAFETY: `display` is open.
        unsafe {
            #[allow(clippy::cast_sign_loss)]
            (self.lib.XSetWindowBackgroundPixmap)(
                self.display,
                window,
                xlib::ParentRelative as c_ulong,
            );
            (self.lib.XSync)(self.display, 0);
        }
    }

    /// Repaints `window` with its background, before drawing a new picture
    /// on a window GTK draws straight onto (see `build_plug`). Synced, so it
    /// lands before GTK's drawing on its own connection.
    fn clear(&self, window: c_ulong) {
        // SAFETY: `display` is open; a zero size means the whole window.
        unsafe {
            (self.lib.XClearArea)(self.display, window, 0, 0, 0, 0, 0);
            (self.lib.XSync)(self.display, 0);
        }
    }

    /// Asks the tray to take in the window `icon`.
    fn dock(&self, tray: c_ulong, icon: c_ulong) {
        let mut message: xlib::XClientMessageEvent = unsafe { std::mem::zeroed() };
        message.type_ = xlib::ClientMessage;
        message.window = tray;
        message.message_type = self.atom("_NET_SYSTEM_TRAY_OPCODE");
        message.format = 32;
        message.data.set_long(0, xlib::CurrentTime as c_long);
        message.data.set_long(1, REQUEST_DOCK);
        #[allow(clippy::cast_possible_wrap)]
        message.data.set_long(2, icon as c_long);
        let mut event = xlib::XEvent {
            client_message: message,
        };
        // SAFETY: `display` is open and `event` is a complete client message.
        unsafe {
            (self.lib.XSendEvent)(self.display, tray, 0, xlib::NoEventMask, &raw mut event);
            (self.lib.XFlush)(self.display);
        }
    }
}

impl Drop for X {
    fn drop(&mut self) {
        // SAFETY: opened in `open` and closed only here.
        unsafe { (self.lib.XCloseDisplay)(self.display) };
    }
}

/// Whether a System Tray is running on this X screen.
pub fn tray_running() -> bool {
    X::open().is_some_and(|x| x.tray().is_some())
}

/// Puts the icon in the tray, and puts it back whenever a tray starts again
/// (GNOME Shell restarting, the extension turned off and on). Main thread.
pub fn start(app: &AppHandle) {
    let Some(x) = X::open() else {
        return;
    };
    let (tooltip, picture) = ICON.with_borrow(|icon| {
        icon.as_ref()
            .map_or((String::from("Sajilo"), None), |icon| {
                (icon.tooltip.clone(), icon.picture.clone())
            })
    });
    let Some(tray) = x.tray() else {
        return;
    };
    let alpha = x.tray_has_alpha(tray);

    let (menu, open, update) = build_menu(app);
    let plug = build_plug(app, alpha, &menu);
    plug.set_tooltip_text(Some(&tooltip));
    // Realised first, so it has a window to hand over.
    plug.realize();
    // X window ids are 29 bits; GTK's binding hands them over as an `i32`.
    let Ok(id) = c_ulong::try_from(plug.id()) else {
        return;
    };
    if !alpha {
        x.take_parent_background(id);
    }
    // Shown before it is docked: GTK sizes the window as it shows it, which
    // after docking would undo the size the tray gave it. A plug that is not
    // yet taken in is not put on screen by showing it.
    plug.show_all();
    x.dock(tray, id);

    ICON.with_borrow_mut(|icon| {
        if let Some(old) = icon.take() {
            // SAFETY: the old window is done with; nothing else holds it.
            unsafe { old.plug.destroy() };
        }
        *icon = Some(Icon {
            plug,
            open,
            update,
            picture,
            tooltip,
        });
    });
}

/// Watches for a tray starting again, on its own thread and connection, and
/// docks the icon anew when one does. A tray announces itself with a
/// `MANAGER` message to the root window.
pub fn watch_for_new_tray(app: AppHandle) {
    std::thread::spawn(move || {
        let Some(x) = X::open() else {
            return;
        };
        let manager = x.atom("MANAGER");
        // SAFETY: `display` is open.
        unsafe {
            let root = (x.lib.XDefaultRootWindow)(x.display);
            (x.lib.XSelectInput)(x.display, root, xlib::StructureNotifyMask);
        }
        loop {
            let mut event: xlib::XEvent = unsafe { std::mem::zeroed() };
            // SAFETY: blocks until the next event, which it writes to `event`.
            unsafe { (x.lib.XNextEvent)(x.display, &raw mut event) };
            // SAFETY: every event starts with its type.
            if unsafe { event.type_ } != xlib::ClientMessage {
                continue;
            }
            // SAFETY: a ClientMessage event.
            let message = unsafe { event.client_message };
            #[allow(clippy::cast_sign_loss)]
            let selection = message.data.get_long(1) as c_ulong;
            if message.message_type == manager && selection == x.selection {
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || start(&handle));
            }
        }
    });
}

/// The window the tray takes in: draws the icon, and takes the clicks. The
/// right-click handler keeps `menu` alive with it.
fn build_plug(app: &AppHandle, alpha: bool, menu: &gtk::Menu) -> gtk::Plug {
    let plug = gtk::Plug::new(0);
    plug.set_title("Sajilo");
    plug.set_app_paintable(true);
    plug.set_size_request(16, 16);
    if alpha && let Some(visual) = WidgetExt::screen(&plug).and_then(|screen| screen.rgba_visual())
    {
        plug.set_visual(Some(&visual));
    }
    plug.add_events(
        gtk::gdk::EventMask::BUTTON_PRESS_MASK | gtk::gdk::EventMask::BUTTON_RELEASE_MASK,
    );

    // Without an alpha channel, the icon shows the tray behind it the old
    // way: its window takes its parent's background (see `start`), which X
    // paints before each redraw, and the icon is drawn straight onto it.
    // GTK's usual off-screen buffer would start from black instead, since GTK
    // cannot see the tray's window to copy from.
    if !alpha {
        use gtk::glib::translate::ToGlibPtr as _;
        let widget: *mut gtk::ffi::GtkWidget = plug.upcast_ref::<gtk::Widget>().to_glib_none().0;
        // SAFETY: `widget` is the live plug. Deprecated in GTK 3, not bound
        // by gtk-rs, and still what GTK's own tray icon did.
        unsafe { gtk::ffi::gtk_widget_set_double_buffered(widget, 0) };
    }
    // A tray that goes away leaves the window on the desktop; keep it hidden
    // until a new tray takes it.
    plug.connect_embedded_notify(|plug| {
        if !plug.is_embedded() {
            plug.hide();
        }
    });
    plug.connect_draw(draw);

    // Left: open or put away, on the release like any button. The press is
    // when a popover that is up sees a click away and closes; the release then
    // finds it just closed and leaves it (see `window::tray_click_on_linux`).
    let handle = app.clone();
    plug.connect_button_release_event(move |_, event| {
        if event.button() == 1 {
            let (x, y) = event.root();
            #[allow(clippy::cast_possible_truncation)]
            crate::window::remember_tray_click((x.round() as i32, y.round() as i32));
            crate::window::tray_click_on_linux(&handle);
        }
        gtk::glib::Propagation::Stop
    });
    // Right: the menu, on the press as menus open.
    let menu = menu.clone();
    plug.connect_button_press_event(move |_, event| {
        if event.button() == 3 {
            menu.popup_at_pointer(Some(event));
        }
        gtk::glib::Propagation::Stop
    });
    plug
}

/// The right-click menu: Open (or Hide) Sajilo, Restart to update while an
/// update waits, and Quit. The same as the other Linux tray's.
fn build_menu(app: &AppHandle) -> (gtk::Menu, gtk::MenuItem, gtk::MenuItem) {
    let shown =
        crate::window::main_window(app).is_some_and(|window| window.is_visible().unwrap_or(false));
    let menu = gtk::Menu::new();
    let open = gtk::MenuItem::with_label(super::popover_label(shown));
    let update = gtk::MenuItem::with_label("Restart to update");
    let quit = gtk::MenuItem::with_label("Quit Sajilo");

    let handle = app.clone();
    open.connect_activate(move |_| crate::window::toggle(&handle));
    let handle = app.clone();
    update.connect_activate(move |_| handle.restart());
    let handle = app.clone();
    quit.connect_activate(move |_| handle.exit(0));

    menu.append(&open);
    menu.append(&update);
    menu.append(&gtk::SeparatorMenuItem::new());
    menu.append(&quit);
    menu.show_all();
    update.hide();
    (menu, open, update)
}

/// Paints the icon centred in whatever square the tray gave it.
fn draw(plug: &gtk::Plug, cairo: &gtk::cairo::Context) -> gtk::glib::Propagation {
    use gtk::gdk::prelude::GdkContextExt as _;

    let picture = ICON.with_borrow(|icon| icon.as_ref().and_then(|icon| icon.picture.clone()));
    let Some(picture) = picture else {
        return gtk::glib::Propagation::Proceed;
    };
    let width = plug.allocated_width();
    let height = plug.allocated_height();
    let scale = plug.scale_factor().max(1);
    let edge = width.min(height).max(1);
    let Some(scaled) = picture.scale_simple(edge * scale, edge * scale, InterpType::Hyper) else {
        return gtk::glib::Propagation::Proceed;
    };

    // With an alpha channel, clear to transparent: the window starts out
    // opaque black. Without one, what is already there is the tray's own
    // background, which the icon is drawn over.
    if plug.visual().is_some_and(|visual| visual.depth() == 32) {
        cairo.set_operator(gtk::cairo::Operator::Source);
        cairo.set_source_rgba(0.0, 0.0, 0.0, 0.0);
        let _ = cairo.paint();
        cairo.set_operator(gtk::cairo::Operator::Over);
    }

    let _ = cairo.save();
    cairo.translate(
        f64::from(width - edge) / 2.0,
        f64::from(height - edge) / 2.0,
    );
    cairo.scale(1.0 / f64::from(scale), 1.0 / f64::from(scale));
    cairo.set_source_pixbuf(&scaled, 0.0, 0.0);
    let _ = cairo.paint();
    let _ = cairo.restore();
    gtk::glib::Propagation::Stop
}

/// Runs `f` on the icon, on the main thread, from any thread.
fn on_main(app: &AppHandle, f: impl FnOnce(&mut Icon) + Send + 'static) {
    let _ = app.run_on_main_thread(move || {
        ICON.with_borrow_mut(|icon| {
            if let Some(icon) = icon.as_mut() {
                f(icon);
            }
        });
    });
}

/// Shows `rgba`, an image `width` by `height` pixels, as the icon.
pub fn set_picture(app: &AppHandle, rgba: Vec<u8>, width: u32, height: u32) {
    on_main(app, move |icon| {
        let (Ok(w), Ok(h)) = (i32::try_from(width), i32::try_from(height)) else {
            return;
        };
        let bytes = gtk::glib::Bytes::from_owned(rgba);
        icon.picture = Some(Pixbuf::from_bytes(
            &bytes,
            Colorspace::Rgb,
            true,
            8,
            w,
            h,
            w * 4,
        ));
        // Without an alpha channel the new picture is drawn over the old
        // one; clear it back to the tray's background first.
        let alpha = icon
            .plug
            .visual()
            .is_some_and(|visual| visual.depth() == 32);
        if !alpha
            && icon.plug.is_realized()
            && let (Some(x), Ok(window)) = (X::open(), c_ulong::try_from(icon.plug.id()))
        {
            x.clear(window);
        }
        icon.plug.queue_draw();
    });
}

/// The tooltip, which carries the date since the icon cannot.
pub fn set_tooltip(app: &AppHandle, text: String) {
    on_main(app, move |icon| {
        icon.plug.set_tooltip_text(Some(&text));
        icon.tooltip = text;
    });
}

/// Names what the menu's first item will do next; see `tray::set_popover_shown`.
pub fn set_popover_shown(app: &AppHandle, shown: bool) {
    on_main(app, move |icon| {
        icon.open.set_label(super::popover_label(shown));
    });
}

/// Shows "Restart to update" with `label`, or hides it with `None`.
pub fn set_update_ready(app: &AppHandle, label: Option<String>) {
    on_main(app, move |icon| match label {
        Some(label) => {
            icon.update.set_label(&label);
            icon.update.show();
        }
        None => icon.update.hide(),
    });
}

/// The edge [`set_picture`] is best given.
pub const fn source_size() -> u32 {
    SOURCE_SIZE
}
