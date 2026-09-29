---
title: Install on Linux
nav: Linux
description: Install Sajilo on Ubuntu, Debian, Mint, Fedora, openSUSE, Arch and other 64-bit Linux, find it in your top bar, and use it on a tiling window manager.
section: start
order: 3
---

Sajilo runs on **64-bit (x86_64) Linux**, on **Ubuntu 22.04 or newer** and distributions of the same age or later. Pick the package for your system:

| Package | Use it on |
|---|---|
| **.deb** | Ubuntu, Debian, Linux Mint, Pop!_OS, Zorin, elementary |
| **.rpm** | Fedora, openSUSE |
| **AppImage** | Arch, Manjaro, EndeavourOS, and anything else |

## With the .deb

[Download the .deb](/dl/linux-deb) (**Sajilo-linux-amd64.deb**), then install it from the folder you saved it in:

```bash
sudo apt install ./Sajilo-linux-amd64.deb
```

`apt` installs what Sajilo needs along with it. Open **Sajilo** from your applications menu.

## With the .rpm

[Download the .rpm](/dl/linux-rpm) (**Sajilo-linux-x86_64.rpm**), then install it from the folder you saved it in.

On Fedora:

```bash
sudo dnf install ./Sajilo-linux-x86_64.rpm
```

On openSUSE:

```bash
sudo zypper install ./Sajilo-linux-x86_64.rpm
```

Either one installs what Sajilo needs along with it.

## With the AppImage

[Download the AppImage](/dl/linux-appimage) (**Sajilo-linux-x86_64.AppImage**), make it executable, and run it:

```bash
chmod +x Sajilo-linux-x86_64.AppImage
./Sajilo-linux-x86_64.AppImage
```

If it complains about **FUSE**, install `libfuse2` (on Ubuntu 24.04 the package is called `libfuse2t64`; on Arch, `sudo pacman -S fuse2`).

## Finding Sajilo in your top bar

Sajilo puts a **Nepal flag** in your panel, in the area where other apps put their icons. On Ubuntu the Nepali date shows beside it. (You can switch the flag for Sajilo's own icon in **Settings → Display → Menu bar**.)

- **Ubuntu, KDE, Cinnamon, Xfce, MATE and Budgie** show it straight away.
- **Other GNOME desktops** (Fedora, Debian, plain GNOME) need the **AppIndicator and KStatusNotifierItem Support** extension. Install it from GNOME Extensions, then log out and back in.

**Click the flag** to open Sajilo, and click it again to close it. **Right-click** it for a menu with **Open Sajilo** and **Quit Sajilo**. On Ubuntu and other GNOME desktops a single click opens that menu instead: it shows today's date and the next festival or holiday, and **Open Sajilo** is right below. **Double-click** the flag to open Sajilo straight away. To close it, you can also click anywhere else or press **Esc**. To keep it on screen and move it around, use the [pin](/docs/first-steps.html#keeping-it-open).

> **No top bar icon at all?** Sajilo still works: opening it from your applications menu always brings up its window.

## On a tiling window manager

Sajilo works on i3, sway, Hyprland, niri and other tiling window managers. Its windows have a fixed size, which most of them float by themselves instead of tiling.

With no top bar to click, open it from a **keyboard shortcut** instead. `sajilo-desktop --toggle` opens Sajilo, and running it again closes it. For example:

```bash
# i3 or sway: ~/.config/i3/config or ~/.config/sway/config
bindsym $mod+n exec sajilo-desktop --toggle

# Hyprland: ~/.config/hypr/hyprland.conf
bind = $mainMod, N, exec, sajilo-desktop --toggle
```

```kdl
// niri: ~/.config/niri/config.kdl, inside binds { }
Mod+N { spawn "sajilo-desktop" "--toggle"; }
```

Waybar, swaybar, i3bar and polybar show Sajilo's flag in their tray, if your bar has a tray enabled, and a click on it opens Sajilo. (For the AppImage, use the AppImage's path instead of `sajilo-desktop`.)

### Keep it floating, under your bar

On Wayland (sway, Hyprland, niri), the compositor decides where every window opens, and apps can't choose. So Sajilo can't put itself under its icon there, and a pinned Sajilo opens where the compositor says, not where you left it. A window rule fixes both. Sajilo's title is always `Sajilo`.

**sway** (`~/.config/sway/config`) or **i3**:

```bash
for_window [title="^Sajilo$"] floating enable, sticky enable
```

`sticky` keeps it on every workspace. On i3, which runs on X11, Sajilo places itself under the tray icon, so the rule is only needed if i3 tiles it.

**Hyprland** (`~/.config/hypr/hyprland.conf`):

```bash
windowrulev2 = float, title:^(Sajilo)$
windowrulev2 = move 1500 56, title:^(Sajilo)$
windowrulev2 = noborder, title:^(Sajilo)$
windowrulev2 = pin, title:^(Sajilo)$
```

For `move`, use your screen's width minus about 420 for the first number, and your bar's height plus a little for the second. `pin` shows it on every workspace.

**niri** (`~/.config/niri/config.kdl`):

```kdl
window-rule {
    match title="^Sajilo$"
    open-floating true
    default-floating-position x=16 y=8 relative-to="top-right"
    focus-ring { off; }
    border { off; }
}
```

Floating windows need niri 25.01 or newer.

### Reminders on a tiling setup

Full desktops like GNOME and KDE have all of this built in. A bare window manager may be missing a piece:

- **Use card reminders** (the default). They're Sajilo's own small window and need nothing else. The **Notification** style needs a notification daemon such as `dunst` or `mako` running.
- **Rounded corners look square or black?** The card is see-through at its corners, which needs a compositor (`picom` on i3; sway and Hyprland have one built in). Without one it still works, it just looks boxier.
- **No chime?** Sajilo plays it with `paplay`, `pw-play` or `aplay`, whichever is installed. Almost every distro ships one; if yours doesn't, install `pipewire` or `pulseaudio-utils`.

## When it's installed

Sajilo opens by itself the first time and then starts when you log in. You can turn that off in **Settings › Display › Startup › Launch at login**.

Next: [what's where in Sajilo](/docs/first-steps.html).
