// Sajilo's own button in GNOME's top bar, so one click opens Sajilo.
//
// GNOME draws other apps' tray icons through the AppIndicator extension, which
// opens an icon's menu on a single click and opens the app only on a double
// click, for every app. Owning the button is the only way to own the click.
//
// Kept deliberately small, because an extension runs inside GNOME Shell: no
// timers, no polling, no window handling. Everything comes over D-Bus from the
// Sajilo app, which stays the one place that knows the date:
//
//   fyi.sajilo.Panel (the app)          this extension
//     Label, Icon properties      ->     what the button shows
//     Toggle(x, y, width, height) <-     a left click, with the button's place
//     Quit()                      <-     "Quit Sajilo" in the right-click menu
//
// The button exists only while the app is on the bus. While it does, this
// extension owns fyi.sajilo.ShellExtension, and the app takes its tray icon
// away so there is one icon, not two; the moment the name goes (disabled,
// failed, the shell restarting) the app puts its tray icon back.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

const APP_BUS = 'fyi.sajilo.Panel';
const APP_PATH = '/fyi/sajilo/Panel';
const APP_IFACE = 'fyi.sajilo.Panel';
const OWN_NAME = 'fyi.sajilo.ShellExtension';

/** Calls the app, ignoring a reply: a click must never wait or throw. */
function callApp(method, params = null) {
    Gio.DBus.session.call(
        APP_BUS, APP_PATH, APP_IFACE, method, params, null,
        Gio.DBusCallFlags.NO_AUTO_START, 2000, null,
        (connection, result) => {
            try {
                connection.call_finish(result);
            } catch (e) {
                // Sajilo quit between the click and the call; the name
                // watcher removes the button.
            }
        });
}

const SajiloButton = GObject.registerClass(
class SajiloButton extends PanelMenu.Button {
    _init(dir) {
        super._init(0.5, 'Sajilo', false);
        // GNOME 49 and later handle a PanelMenu.Button's clicks with a gesture
        // that opens the menu; the clicks are handled below instead.
        this._clickGesture?.set_enabled(false);

        this._dir = dir;
        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        this._icon = new St.Icon({style_class: 'system-status-icon'});
        this._label = new St.Label({
            style_class: 'sajilo-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._icon);
        box.add_child(this._label);
        this.add_child(box);

        this.menu.addAction('Open Sajilo', () => this._toggle());
        this.menu.addAction('Quit Sajilo', () => callApp('Quit'));
        this.setIcon('flag');
    }

    setLabel(text) {
        this._label.text = text;
        this._label.visible = text.length > 0;
        this.accessible_name = text ? `Sajilo, ${text}` : 'Sajilo';
    }

    setIcon(name) {
        const file = name === 'app' ? 'sajilo.png' : 'flag.svg';
        this._icon.gicon = Gio.FileIcon.new(
            this._dir.get_child('icons').get_child(file));
    }

    /** Tells the app where the button is, so Sajilo opens right under it. */
    _toggle() {
        const [x, y] = this.get_transformed_position();
        const [width, height] = this.get_transformed_size();
        callApp('Toggle', new GLib.Variant('(iiii)', [
            Math.round(x), Math.round(y), Math.round(width), Math.round(height),
        ]));
    }

    // Left click or touch opens Sajilo; right click opens the menu. Replaces
    // PanelMenu.Button's own handler, which opens the menu on any click.
    vfunc_event(event) {
        const type = event.type();
        const left = type === Clutter.EventType.TOUCH_BEGIN ||
            (type === Clutter.EventType.BUTTON_PRESS &&
                event.get_button() === Clutter.BUTTON_PRIMARY);
        const right = type === Clutter.EventType.BUTTON_PRESS &&
            event.get_button() === Clutter.BUTTON_SECONDARY;
        if (left) {
            this.menu.close();
            this._toggle();
            return Clutter.EVENT_STOP;
        }
        if (right) {
            this.menu.toggle();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }
});

export default class SajiloExtension extends Extension {
    enable() {
        this._watchId = Gio.bus_watch_name(
            Gio.BusType.SESSION, APP_BUS, Gio.BusNameWatcherFlags.NONE,
            () => this._appeared(),
            () => this._vanished());
    }

    disable() {
        if (this._watchId) {
            Gio.bus_unwatch_name(this._watchId);
            this._watchId = 0;
        }
        this._vanished();
    }

    _appeared() {
        if (this._button)
            return;
        this._button = new SajiloButton(this.dir);
        Main.panel.addToStatusArea(this.uuid, this._button);

        this._signalId = Gio.DBus.session.signal_subscribe(
            APP_BUS, 'org.freedesktop.DBus.Properties', 'PropertiesChanged',
            APP_PATH, null, Gio.DBusSignalFlags.NONE,
            (_connection, _sender, _path, _iface, _signal, params) => {
                const [, changed] = params.deepUnpack();
                this._apply(changed);
            });
        Gio.DBus.session.call(
            APP_BUS, APP_PATH, 'org.freedesktop.DBus.Properties', 'GetAll',
            new GLib.Variant('(s)', [APP_IFACE]), null,
            Gio.DBusCallFlags.NO_AUTO_START, 2000, null,
            (connection, result) => {
                try {
                    const [all] = connection.call_finish(result).deepUnpack();
                    this._apply(all);
                } catch (e) {
                    // The app went away again; `_vanished` tidies up.
                }
            });

        // Only now, with the button in the bar, may the app hide its tray icon.
        this._ownId = Gio.bus_own_name(
            Gio.BusType.SESSION, OWN_NAME, Gio.BusNameOwnerFlags.NONE,
            null, null, null);
    }

    _vanished() {
        if (this._ownId) {
            Gio.bus_unown_name(this._ownId);
            this._ownId = 0;
        }
        if (this._signalId) {
            Gio.DBus.session.signal_unsubscribe(this._signalId);
            this._signalId = 0;
        }
        this._button?.destroy();
        this._button = null;
    }

    /** Applies properties, each a GLib.Variant, from GetAll or a change. */
    _apply(properties) {
        if (!this._button)
            return;
        if (properties.Label)
            this._button.setLabel(properties.Label.deepUnpack());
        if (properties.Icon)
            this._button.setIcon(properties.Icon.deepUnpack());
    }
}
