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

On Linux the icon is a StatusNotifierItem, the D-Bus protocol KDE, GNOME's
AppIndicator extension, Cinnamon, Xfce and Waybar all host. Tauri's
`tray-icon` has two backends for it, and Sajilo uses `ksni` (turned on in
`apps/desktop/src-tauri/Cargo.toml`), not libappindicator:

- **A left click reaches the app.** The panel calls the item's `Activate`, which
  arrives as a left click and toggles the popover. libappindicator marks its
  item menu-only and has no `Activate`, so every click opened the menu.
- **The right click is the menu:** Open (or Hide) Sajilo, then Quit.
- **GNOME's extension is the exception.** It opens the menu on a single left
  click for every app and calls `Activate` only on a double click. So on
  Ubuntu the menu still leads with Open.
- **macOS and Windows** report a press and a release; see `window::tray_press`
  for why a click on the icon needs both to close the popover. Linux reports
  one event per click, and the click-away's short wait means the popover is
  still up when it arrives, so a plain toggle is right there.

`ksni` is patched in `vendor/ksni` (see `PATCHED.md` there) for two things:
the `XAyatanaLabel` that GNOME draws beside the icon, which is where the date
shows on Ubuntu, and registering once a panel appears when Sajilo starts
before it. The label is the tray title; with the flag as the icon, the title
leaves out its own flag so the top bar does not show two.

Trays that only take old XEmbed icons (i3bar, polybar, `stalonetray`) show no
icon at all; libappindicator used to fall back to XEmbed, `ksni` does not.
`snixembed` bridges them, and `sajilo-desktop --toggle` needs no tray.

## Closing

| Way | macOS | Windows | Linux |
|---|---|---|---|
| Click anywhere outside | Yes | Yes | Yes (see below) |
| Escape | Yes | Yes | Yes |
| Click the tray icon | Yes | Yes | Yes (a single click opens the menu on GNOME) |
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

- **X11** (and XWayland): every 25 ms it asks X whether a mouse button is down
  (`mouse_button_down`, through GDK, which can answer for any window). A
  button down with the pointer outside the popover hides it. That is the click
  that took focus, or, where focus follows the mouse, the next click anywhere.
  The watch ends when the popover has focus again or is put away. A click
  shorter than 25 ms can slip between two checks; a real one lasts longer, but
  `xdotool click` does not, so tests press and release with a pause between.
- **Wayland**: no app can see a click outside its own windows. The watch waits
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

Also try a break card from Routine, "Show me an example": it should open at the
top centre without taking focus, and the popover should stay up under it. To
hear whether the chime plays without a sound card, point ALSA at a file
(`~/.asoundrc`: `pcm.!default { type file; slave.pcm "null"; file "/tmp/out.raw"; format "raw" }`)
and install `alsa-utils`; the file fills when it plays.

The pin and dragging use the same code on macOS and Windows, but the window
move itself belongs to each system, so try a pin and a drag there by hand too.
