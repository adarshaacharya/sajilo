# One-click open on GNOME — plan

Status: plan, not built. Target: Ubuntu 24.04–26.04 and Fedora (GNOME 46–50).

## Why one click opens a menu today

On GNOME, Sajilo's tray icon is not drawn by GNOME itself. Sajilo publishes a
StatusNotifierItem (via `ksni`, see `apps/desktop/src-tauri/src/tray/`), and
the **AppIndicator extension** that Ubuntu ships draws it. That extension
decides what clicks do, not the app:

| Click | What the extension does |
|---|---|
| Left, single | Waits out the double-click time, then opens the menu. With an empty menu: nothing. |
| Left, double | Sends `Activate` → Sajilo opens. |
| Middle | Sends `SecondaryActivate`. |
| Right | Opens the menu. |

Source: `indicatorStatusIcon.js` `vfunc_button_press_event`, and
`appIndicator.js`, where `supportsActivation = !!interfaceInfo.lookup_method('Activate')`
(upstream `ubuntu/gnome-shell-extension-appindicator`, master).

`ItemIsMenu`, no menu and an empty menu are all ignored, so **no SNI setting
gives a single-click open**. Every tray app on Ubuntu behaves this way
(Dropbox, Telegram, Nextcloud, KeePassXC, Electron and Tauri apps).
Requests for a single-click option (upstream issues #611, #575, #490 and #120)
are all open. KDE and most other desktops already open Sajilo on one click;
this is GNOME-only.

The only way to own the click is to own the panel button, i.e. a GNOME Shell
extension of our own.

## What we build

A tiny extension, `sajilo@sajilo.fyi`, that puts Sajilo's own button in the top
bar. It shows the same icon and date text as the tray, and a left click
opens Sajilo. It is kept deliberately dumb: all logic stays in the Rust app.

```
apps/gnome-extension/
  metadata.json      uuid, name, shell-version ["46","47","48","49","50"]
  extension.js       the button; ~150 lines, no dependencies
  stylesheet.css     label spacing only
```

### The link: D-Bus, both ways

The app already uses `zbus` (`src/system/dbus.rs`). It exports one small
interface on the session bus:

```
fyi.sajilo.Panel  at /fyi/sajilo/Panel
  method  Toggle(x: i32, y: i32, width: i32, height: i32)   // the button's rect
  method  Menu(x: i32, y: i32)                               // right click: Open / Quit
  property Label: s        (emits PropertiesChanged)        // "आइत १२" etc.
  property IconName: s
```

The extension:
- watches the bus name (`Gio.bus_watch_name`), and only shows the button while
  Sajilo is running, so there is never a dead button
- reads `Label` and follows its changes, so the date text stays computed in
  Rust (see CLAUDE.md: the frontend never computes a BS date, and nor does the
  extension)
- calls `Toggle` with its own screen rect on a left click, and `Menu` on a right
  click
- claims `fyi.sajilo.ShellExtension` on the bus while it is enabled

The app watches `fyi.sajilo.ShellExtension`:
- **owned** → unregister the `ksni` item (one icon, not two)
- **lost** (extension disabled, errored, or GNOME updated past its
  `shell-version`) → register the tray again. The tray never goes away unless
  the button is really there.

### Placing the window

Sajilo already runs through XWayland on GNOME (`GDK_BACKEND=x11`, `lib.rs`),
so `set_position` works. `Toggle`'s rect gives the exact spot, which is better
than today's cursor guess (`window.rs`, the Linux positioning). A fallback, if we
ever move to native Wayland, is for the extension to move the window itself
(`Meta.Window.move_frame`), but it isn't needed now.

## Shipping it

| Format | How the extension gets there |
|---|---|
| .deb | Tauri `bundle.linux.deb.files` → `/usr/share/gnome-shell/extensions/sajilo@sajilo.fyi/`. It is installed, updated and removed with the package. |
| .rpm | Same path via `bundle.linux.rpm.files`. |
| AppImage | Sajilo copies it to `~/.local/share/gnome-shell/extensions/` on launch, when the bundled version is newer. |

**Enabling.** Files on disk are not enabled. On first launch under GNOME,
Sajilo runs `gnome-extensions enable sajilo@sajilo.fyi` once, as the user. It
records that in settings and never re-enables if the user later turned it
off. If `disable-user-extensions` is set (as on managed machines), it does
nothing and the tray stays.

**The one logout.** GNOME on Wayland only scans for extensions at login. So
after the first install:
1. The tray works as today.
2. Sajilo shows one notification: "Log out and back in once to open Sajilo with
   one click." This replaces today's double-click tip.
3. After the next login the button appears and the tray icon steps aside.

Updates follow the same pattern: new extension code runs after the next login,
and the old code keeps working until then. The D-Bus interface is versioned
(`Version` property) so an old extension never breaks against a newer app.

**extensions.gnome.org.** It's optional and can come later. A copy there
installs live, without logging out, for people who prefer it. A .deb-shipped
copy needs no review. We'd follow the review rules anyway (nothing at import
time, everything undone in `disable()`, no spawning processes), because they're
also the rules that keep the shell safe.

## Safety: learning from 0.1.32

The 0.1.32 logout loop was a tray bug that crashed GNOME Shell. An extension
runs *inside* GNOME Shell, so the bar is higher:

- Errors in `enable()` put the extension into the ERROR state, and GNOME
  disables it without crashing. The real danger is a loop or bad Clutter use,
  which can freeze the shell. So:
  - no timers or polling: only D-Bus signals
  - no window tracking and no `Meta` calls in v1
  - every signal is disconnected in `disable()`
- It is tested in a nested shell before any release:
  `dbus-run-session -- gnome-shell --devkit` (GNOME 49+) or `--nested` (46–48),
  including enable/disable 50 times, Sajilo killed while the button is up,
  and the screen locked and unlocked (extensions are disabled on the lock
  screen).
- The Sajilo UI has a switch, **Settings › General › Top-bar button (GNOME)**,
  which runs `gnome-extensions disable`.
- Release is gated on a real Ubuntu 26.04 machine, plus one of 24.04 or Fedora,
  before it goes to everyone.

## Click handling across GNOME versions

`PanelMenu.Button` changed input handling in GNOME 49 (click gestures). To stay
version-proof we override `vfunc_event` and handle `BUTTON_PRESS` or `TOUCH_BEGIN`
ourselves, as the AppIndicator extension does. The one file serves 46–50.

## Steps

1. **App side** (Rust, testable on CI):
   - the `fyi.sajilo.Panel` D-Bus interface
   - the `Label` property fed from the same code as the tray title
   - swapping the tray on `fyi.sajilo.ShellExtension`
   - placing the window from `Toggle`
2. **Extension:** `apps/gnome-extension/`, plus lint with `eslint` using the
   GNOME config in CI.
3. **Packaging:**
   - the deb and rpm `files` entries
   - the AppImage copy on launch
   - the one-time enable, the logout notification and the Settings switch
4. **Test:** nested shell on 46/48/50, then real Ubuntu 26.04 (the friend's
   machine is a good second check).
5. **Docs:** `install-linux.md` explains the one logout; `docs/popover-window.md`
   gets the checklist.
6. **Later, optional:** publish on extensions.gnome.org.

Estimate: steps 1–3 are about 2 days of work. Testing on real GNOME is the long
pole.

## Not doing

- Asking users to install the extension by hand: few would.
- Forcing it on: users can always turn it off, and Sajilo respects that.
- Replacing the AppIndicator extension or patching Ubuntu's copy.
