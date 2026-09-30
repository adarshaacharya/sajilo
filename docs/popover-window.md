# The popover window: opening, closing, pinning and dragging

Sajilo lives in one small window, the popover, that hangs from its tray or
menu-bar icon. This page is how that window behaves on each platform, why, and
how to test it. The code is in `apps/desktop/src-tauri/src/window.rs` unless
said otherwise.

## One rule: hidden, never closed

The popover is hidden when it goes away, never closed. Closing destroys the
webview, and with it every loaded feed, every scroll position and a radio
stream mid-play. Hiding keeps all of that, so the next open is instant. Every
way of putting it away goes through `window::hide`.

## Opening

A click on the tray icon, Open in the tray menu, or a second launch of the app
shows it through `window::show`. Where it appears depends on the platform:

| Platform | Where it opens | How it knows |
|---|---|---|
| macOS | Centred under the menu-bar icon | The icon's frame, from the tray (`under_menu_bar_icon`) |
| Windows | Against the taskbar, lined up with the icon | Where the icon was clicked (`above_taskbar`) |
| Linux | Against the panel, under the tray icon | The work area and the pointer (`center_under_cursor`) |

Linux trays tell an app little about where its icon is (a click's
coordinates, which some panels leave at zero), so Sajilo works it out:

- **Which edge the panel is on** comes from the work area. A panel reserves a
  strip of the screen, so the work area is inset at the top (GNOME) or the
  bottom (KDE, Cinnamon, most tiling bars). The popover hangs from that edge.
  Only when no panel reserves space (one that hides itself) does the pointer's
  half of the screen decide.
- **Where along the panel** comes from the pointer, but only when the open came
  from the tray, with the pointer near the panel. Any other open, such as
  Sajilo showing itself at first launch with the pointer anywhere, takes the
  right-hand end of the panel, where trays sit.

A pinned popover skips all of this and opens where it was left (see below).

### The Linux tray icon

Linux has two kinds of tray icon, and Sajilo picks, per desktop, the one whose
tray opens Sajilo on a single left click (`tray/linux_host.rs`):

| Tray | Icon | Why |
|---|---|---|
| KDE, Cinnamon, Xfce, MATE, Waybar | StatusNotifierItem | The panel calls `Activate` on a left click |
| GNOME's AppIndicator extension (Ubuntu, Fedora, Pop!_OS) | StatusNotifierItem | Never a System Tray icon; see below. A left click opens the menu, a double click opens Sajilo |
| i3bar, polybar, `stalonetray` | System Tray | The only kind they show |
| Anything, with GTK drawing straight to Wayland | StatusNotifierItem | There is no System Tray without X11 |

**Why GNOME never gets the System Tray icon.** 0.1.32 gave it one, because
the extension hands a System Tray icon the left click. On Ubuntu 26.04
(GNOME on Wayland, Sajilo on XWayland) GNOME Shell then aborted on
`BadWindow (request_code 2)` about three seconds after login: the shell went
to change the attributes of Sajilo's icon window while taking it in, found it
gone, and GDK's X error handler ended the process, and with it the session.
Sajilo starts at login, so every login did it again, until the user removed
Sajilo from a recovery shell. A StatusNotifierItem is a D-Bus object and
hands GNOME no X window, so it cannot fail that way. The single click is the
price.

It tells GNOME from the rest by the process that owns
`org.kde.StatusNotifierWatcher` on the session bus: `gnome-shell`. At login
the panel may not be up yet, so it looks again every half second, and a
tray of either kind waits three seconds for the other before it counts (KDE
on X11 runs both, and its System Tray bridge can come up first).

**The StatusNotifierItem** is Tauri's `tray-icon` through `ksni` (turned on
in `apps/desktop/src-tauri/Cargo.toml`), not libappindicator, which marks its
item menu-only so that every click opened the menu. A left click arrives as
`Activate`; the right click is the menu: Open (or Hide) Sajilo, then Quit.
`ksni` is patched in `vendor/ksni` (see `PATCHED.md` there) for the
`XAyatanaLabel`, the date some trays draw beside the icon, and for
registering once a panel appears when Sajilo starts before it. The label is
the tray title; with the flag as the icon, the title leaves out its own flag.

**The System Tray icon** (`tray/xembed.rs`) is a small GTK window (a
`GtkPlug`) that Sajilo asks the tray to take in, as GTK's old `GtkStatusIcon`
did. A left click on it is a click on Sajilo's own window, so it toggles the
popover on the release; the right click pops a GTK menu with the same items.
It is used only where no StatusNotifierItem host exists (i3bar, polybar,
`stalonetray`), never on GNOME. What it gives up:

- **No date beside it.** The tray gives it a small square, so it carries the
  icon alone. The date is its tooltip, where the tray passes the pointer on;
  GNOME's passes the icon only clicks, so there is none there.
- **Transparency is the tray's call.** A tray that names a 32-bit visual in
  `_NET_SYSTEM_TRAY_VISUAL` (GNOME, i3bar, polybar) gets see-through
  corners. Otherwise the icon takes its parent's background
  (`ParentRelative`) and is drawn straight onto it. `stalonetray` paints its
  own background rather than leave it to X, so there, after switching the
  icon in Settings, bits of the old one can show until the tray redraws.
- **The tray sets its size.** Trays that follow the protocol refuse the
  icon's own resize requests; GTK makes one after being taken in.

When a tray restarts (i3 reloading, a bar restarted), it announces itself
with a `MANAGER` message to the root window, and Sajilo docks a new icon, but
carefully, since a tray is another program holding Sajilo's window:

- An icon still embedded is left alone; the announcement changed nothing.
- A replaced icon is hidden and destroyed only ten seconds later, so a tray
  still taking it in never finds it gone.
- After two re-docks inside a minute the tray is taken to be crashing and is
  not docked into again, rather than fed icon after icon.

 Trays keep the old window alive by adding it to their
save-set, as the protocol asks; one that did not would take it down with
it, and GTK aborts on the next call to a window it did not expect to lose.

**Clicks on macOS and Windows** report a press and a release; see
`window::tray_press` for why a click on the icon needs both to close the
popover. Linux acts on one event per click, the release, and the
click-away's short wait means the popover is still up when it arrives, so a
plain toggle is right there.

## Closing

| Way | macOS | Windows | Linux |
|---|---|---|---|
| Click anywhere outside | Yes | Yes | Yes (see below) |
| Escape | Yes | Yes | Yes |
| Click the tray icon | Yes | Yes | Yes (a single click opens the menu on GNOME; double-click opens Sajilo) |
| Open a link | Yes, so the browser comes to the front | Yes | Yes |

A pinned popover ignores clicks outside and links, but Escape and the tray
still put it away. While the popover shows a dialog of its own (a file picker,
a "delete this?" prompt), it is held open so the dialog's focus does not count
as a click away (`set_pinned`, from the page's `pinPopover`).

### Clicking outside on Linux

On macOS and Windows a focus-out means the user clicked somewhere else, and the
popover hides. On Linux it often does not:

- GNOME has been seen to take focus from an undecorated, always-on-top window
  on its own, with nobody touching anything.
- A desktop that moves focus with the mouse (Cinnamon's "sloppy" or "mouse"
  focus, sway and Hyprland by default, niri's `focus-follows-mouse`) takes it
  the moment the pointer is over another window. Hiding then closed the
  popover while someone was only moving the mouse.

So on Linux a focus-out only starts a watch (`click_away_on_linux`), and only
if the popover had focus since it opened, has been up at least 400 ms, and is
not held open for a dialog. What the watch does depends on the session:

- **X11** (an X11 session, not XWayland): every 25 ms it asks X whether a mouse button is down
  (`mouse_button_down`, through GDK, which can answer for any window). A
  button down with the pointer outside the popover hides it. That is the click
  that took focus, or, where focus follows the mouse, the next click anywhere.
  The watch ends when the popover has focus again or is put away. A click
  shorter than 25 ms can slip between two checks; a real one lasts longer, but
  `xdotool click` does not, so tests press and release with a pause between.
- **Wayland**, XWayland included: no app can see a click outside its own
  windows. XWayland is where Sajilo runs on GNOME's Wayland (Ubuntu), and X
  there sees buttons only over X windows: a click on the desktop or a Wayland
  app never shows as a button down, so the X11 watch kept the popover open
  for good (`x_sees_every_click`). The watch waits
  250 ms for the focus to stay gone, then hides unless the pointer is over the
  popover, or the focus-out came within 120 ms of the pointer leaving it
  (`HOVER_FOCUS`), which is focus following the mouse rather than a click.
  With focus following the mouse, a later click elsewhere cannot be seen, so
  the popover stays until Escape, the tray icon, or a click away after
  clicking back into it.

Clicking the tray icon while the popover is open is itself a click away: the
press closes it, then the panel sends the click on release. A click on the icon
within 500 ms of a click away is that same close, not a new open
(`tray_click_on_linux`).

Whether the pointer is outside (`pointer_inside`) is known three ways, in
order:

1. **The page's own report.** The page sees the pointer enter and leave the
   window on every platform and session, and tells the shell
   (`ReportPointer` in `App.tsx`, the `popover_pointer` command). This is exact.
2. **Asking X11,** before the page has reported anything. On X11 the shell can
   read the pointer anywhere on screen. A failed read counts as inside, so it
   never closes anything by mistake.
3. **On Wayland,** before the page has reported, the pointer counts as away. A
   Wayland session never tells an app where the pointer is, and this way a
   click elsewhere still closes a popover that was never hovered.

## Keeping it open: the pin

The pin sits in the header, beside Settings, on every screen: in `Header`
(`shared/components/header.tsx`) and in Today's own header (`DateHeader` in
`features/calendar/_components/date-header.tsx`). The button is
`KeepOpenButton`.

**Pinned:**

- A click outside does not close it.
- Opening a link does not close it (`external-link.ts` checks `isKept()`).
- It drags by its header, like a title bar.
- It reopens where it was left, across restarts too.
- Escape and the tray still put it away, so there is always a way out.
- The pin shows the accent colour on a faint wash of it
  (`.icon-btn[aria-pressed="true"]` in `index.css`). The colour lives in CSS
  because the unlayered `.icon-btn` rule overrides a Tailwind colour class.

**Unpinned,** it is the tray popover again: it closes on a click away and opens
at the tray. Unpinning forgets the saved place.

### How it is stored

- In the shell: `KEPT_OPEN` (on or off) and `KEPT_PLACE` (the last position,
  in logical pixels, so it survives a change of display scale).
- On disk: the settings key `popover.keptOpen.v1`. It holds `null` when not
  pinned, `{ "x": .., "y": .. }` when pinned with a place, and `{}` when pinned
  before it has been moved.
- It is read at startup, before anything can show the window
  (`window::load_kept` in `lib.rs`).
- A drag reports every step (`WindowEvent::Moved` calls `remember_move`). The
  place is kept in memory and written to disk when the popover is put away, not
  on every step.
- On reopen, the saved place is used only if a connected screen still shows
  the top of the window. A spot on an unplugged monitor falls back to the tray.

### How dragging works

The header gets a native `mousedown` listener while pinned (`useDragWhenKept`
in `shared/lib/popover-kept.ts`) that calls Tauri's `startDragging`, which
hands the move to the window manager. Presses on the header's own controls
(buttons, links, fields, tabs) are left alone, so the pin, Back and Settings
still work while pinned. It is a native listener rather than a React
`onMouseDown` because it is window chrome, not a page control: moving a window
from the keyboard is the operating system's own shortcut. The
`core:window:allow-start-dragging` permission is already in
`capabilities/default.json`. The header shows a grab cursor while pinned.

### The page's side

`shared/lib/popover-kept.ts` holds one value for the whole page. It is read
from the shell once (`popover_kept`) and changed only by the pin
(`set_popover_kept`), so every header shows the same state.

## Known limits

- **Pure Wayland placement.** On a Wayland session without XWayland the
  compositor decides where windows go, and a normal app window cannot choose.
  Only the layer-shell protocol allows that, and Tauri does not support it.
  Everything else works, including closing on a click outside and dragging
  while pinned.
- **Tiling window managers** tile the popover like any window unless told to
  float it. `INSTALLATION_INSTRUCTIONS.md` has the one-line rule for Hyprland,
  sway and i3, matched on the window's fixed title, `Sajilo`.
- **Shown at launch without focus.** When Sajilo shows itself at launch, some
  window managers refuse it focus, as they do for any app that opens itself.
  With no focus to lose, a click elsewhere does nothing until the user has
  clicked inside it once. A launch from the app menu normally carries a token
  that grants focus.
- **KDE shows no date text** beside the tray icon. Sajilo sends it, but Plasma
  draws tray icons only.

## Testing on Linux

The container Claude Code runs in, and any Linux machine, can run the real app
on a virtual screen, with a stand-in panel for its tray icon. What you need:
`Xvfb`, `openbox`, `xdotool`, `x11-utils` and `dbus-x11`
(`apt-get install openbox dbus-x11 x11-utils`), and the stand-in panel in
`scripts/sni-watcher`, which accepts the tray icon and prints its bus name. It
draws nothing, so you click the icon with `gdbus` instead of the mouse.

```bash
# The frontend, a debug build of the app, and the stand-in panel
(cd apps/desktop && bun run dev &)
cargo build -p sajilo-desktop
cargo build --manifest-path scripts/sni-watcher/Cargo.toml --target-dir target/sni-watcher

# A 1280x720 screen, a session bus and a window manager
export DISPLAY=:99 LANG=C.UTF-8
Xvfb :99 -screen 0 1280x720x24 &
eval "$(dbus-launch --sh-syntax)"
openbox &

# Start the app before the panel, as at login: the icon must still register
target/debug/sajilo-desktop &
target/sni-watcher/debug/sni-watcher | tee /tmp/watcher.log &
ITEM=$(awk '/REGISTERED/ {print $2}' /tmp/watcher.log | tail -1)
```

Then read what the panel sees, click the icon, and read the window's state:

```bash
prop() { gdbus call --session -d "$ITEM" -o /StatusNotifierItem \
  -m org.freedesktop.DBus.Properties.Get org.kde.StatusNotifierItem "$1"; }
prop Id              # 'sajilo'
prop ItemIsMenu      # false, so a panel calls Activate on a left click
prop XAyatanaLabel   # the date GNOME shows beside the icon

click() { gdbus call --session -d "$ITEM" -o /StatusNotifierItem \
  -m org.kde.StatusNotifierItem.Activate 1250 705; }
click                # a left click on the icon

W=$(xdotool search --name '^Sajilo$' | head -1)
xwininfo -id "$W" | grep -E 'Map State|Absolute'   # IsViewable or IsUnMapped, and where
xdotool mousemove 250 400 click 1                   # a click on the desktop
gdbus call --session -d "$ITEM" -o /MenuBar \
  -m com.canonical.dbusmenu.GetLayout -- 0 -1 '[]' # the right-click menu
dbus-monitor --session "interface='org.kde.StatusNotifierItem'"  # XAyatanaNewLabel as the date changes
import -window root screen.png                      # a screenshot
```

Things that will trip you up:

- `xdotool windowkill` kills the whole app, not one window. Close a break card
  with its own Skip button.
- `pkill -f sajilo-desktop` can match your own shell's command line. Use
  `kill $(pidof sajilo-desktop)`.
- Clicking a `<select>` opens its dropdown, and Escape then closes the dropdown
  rather than the popover. Click plain text before pressing Escape.
- Launched from a shell, Sajilo gets no focus when it shows itself at start.
  Click inside it once before testing a click away.
- To take the Wayland path while still drawing through X11, start the app with
  `GDK_BACKEND=wayland,x11`. GTK falls back to X11, but Sajilo sees a
  non-X11 backend and relies on the page's pointer report alone.

What to check, in order, before shipping a change to this window:

| # | Step | Expect |
|---|---|---|
| 0 | Start the app, then the stand-in panel | The icon registers; `XAyatanaLabel` is the date, with no flag in it |
| 1 | Launch | Opens against the panel, by the tray |
| 2 | Click inside, then on the desktop | Closes |
| 3 | Click the icon (`Activate`) | Opens by the tray |
| 4 | Focus another window with the pointer over the popover | Stays open |
| 4b | Turn on focus-follows-mouse (openbox: `<followMouse>yes</followMouse>` in `~/.config/openbox/rc.xml`, then `openbox --reconfigure`), hover another window, then click it | Stays open while hovering; closes on the click |
| 5 | Escape | Closes |
| 6 | Click the icon while open | Closes; the menu offers Open |
| 7 | Pin, then click the desktop | Stays open |
| 8 | Drag Today's header | Moves |
| 9 | Escape, then open from the tray | Reopens where it was dragged |
| 10 | Restart the app | Still pinned, same place |
| 11 | Drag another screen's header (News) | Moves |
| 12 | Unpin, then click the desktop | Closes |
| 13 | Open from the tray | Opens by the tray again |
| 14 | Restart | Opens by the tray, not pinned |
| 15 | Run 1 to 6 again with `GDK_BACKEND=wayland,x11` | Same results |
| 16 | Unpinned, press Mini view | Shrinks to the strip in place, and the pin is on |
| 17 | Drag the strip; click the desktop | Moves; stays open |
| 18 | Escape, then the tray | Back as the strip, where it was dragged |
| 19 | Restart | Still the strip, same place |
| 20 | Open a reminder card's Open while mini | The full view opens on that screen |
| 21 | Strip's expand button, then unpin | Full view, still pinned; then the tray popover |

Also try a break card from Routine, "Show me an example": it should open at the
top centre without taking focus, and the popover should stay up under it. To
hear whether the chime plays without a sound card, point ALSA at a file
(`~/.asoundrc`: `pcm.!default { type file; slave.pcm "null"; file "/tmp/out.raw"; format "raw" }`)
and install `alsa-utils`; the file fills when it plays.

The pin and dragging use the same code on macOS and Windows, but the window
move itself belongs to each system, so try a pin and a drag there by hand too.

### The System Tray icon

`stalonetray` (`apt-get install stalonetray`) is a real System Tray, drawn on
the screen, so the icon can be clicked with the mouse. Start it instead of
the stand-in panel; with no StatusNotifierItem host, Sajilo docks there after
its three-second wait:

```bash
stalonetray --geometry 4x1-0-0 --icon-size 24 -bg '#303030' &
target/debug/sajilo-desktop &
# The icon sits at the tray's left end, (1196, 708) on the 1280x720 screen
xdotool mousemove 1196 708 mousedown 1 sleep 0.12 mouseup 1
```

Hold each click for a moment, as above: the click-away watch looks for a
pressed button every 25 ms, and `xdotool click` presses and releases faster
than that, faster than any hand.

To take GNOME's path, run the stand-in panel under the name `gnome-shell`
(`cp target/sni-watcher/debug/sni-watcher /tmp/gnome-shell`) alongside
`stalonetray`: the panel should see nothing register, and the icon dock in
`stalonetray`. Then check:

| Setup | Expect |
|---|---|
| Stand-in panel and `stalonetray` | A StatusNotifierItem; nothing in `stalonetray` |
| `gnome-shell` and `stalonetray` | The System Tray icon; nothing registers |
| `gnome-shell` alone | A StatusNotifierItem, after three seconds |
| `stalonetray` alone, started after the app | The System Tray icon, once it is up |
| `gnome-shell` and `stalonetray`, app with `GDK_BACKEND=wayland,x11` | A StatusNotifierItem |

With the System Tray icon, run steps 1 to 6 above clicking the icon itself,
right-click it for the menu, switch the icon in Settings, and restart
`stalonetray` under the running app: the icon should come back in the new
tray.
