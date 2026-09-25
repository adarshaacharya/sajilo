---
title: Install on Linux
nav: Linux
description: Install Sajilo on Ubuntu, Debian, Mint, Fedora, openSUSE, Arch and other 64-bit Linux, make its date show in your top bar, and use it on a tiling window manager.
section: start
order: 3
---

Sajilo runs on **64-bit (x86_64) Linux**, on **Ubuntu 22.04 or newer** and distributions of the same age or later. Pick the package for your system:

| Package | Use it on |
|---|---|
| **.deb** | Ubuntu, Debian, Linux Mint, Pop!_OS, Zorin, elementary |
| **.rpm** | Fedora, openSUSE |
| **AUR** (`sajilo-bin`) | Arch, Manjaro, EndeavourOS |
| **AppImage** | Anything else |

## With the .deb

Download **Sajilo-linux-amd64.deb** from the [download section](/#download), then install it from the folder you saved it in:

```bash
sudo apt install ./Sajilo-linux-amd64.deb
```

`apt` installs what Sajilo needs along with it. Open **Sajilo** from your applications menu.

## With the .rpm

Download **Sajilo-linux-x86_64.rpm** from the [download section](/#download), then install it from the folder you saved it in.

On Fedora:

```bash
sudo dnf install ./Sajilo-linux-x86_64.rpm
```

On openSUSE:

```bash
sudo zypper install ./Sajilo-linux-x86_64.rpm
```

Either one installs what Sajilo needs along with it.

## On Arch, from the AUR

Sajilo is in the AUR as **sajilo-bin**. With an AUR helper:

```bash
yay -S sajilo-bin
```

(or `paru -S sajilo-bin`). It updates along with the rest of your system.

## With the AppImage

Download **Sajilo-linux-x86_64.AppImage**, make it executable, and run it:

```bash
chmod +x Sajilo-linux-x86_64.AppImage
./Sajilo-linux-x86_64.AppImage
```

If it complains about **FUSE**, install `libfuse2` (on Ubuntu 24.04 the package is called `libfuse2t64`).

## Seeing the date in your top bar

Sajilo shows the Nepali date in your top bar, in the area where other apps put their icons.

- **KDE, Cinnamon, Xfce, MATE and Budgie** show it straight away.
- **Ubuntu** has the extension it needs turned on already.
- **Other GNOME desktops** (Fedora, Debian, plain GNOME) need the **AppIndicator and KStatusNotifierItem Support** extension. Install it from GNOME Extensions, then log out and back in.

Linux doesn't pass a click on a top-bar icon through to the app, so **click the date and choose Open Sajilo** from its menu.

> **No top bar icon at all?** Sajilo still works: opening it from your applications menu always brings up its window.

## On a tiling window manager

Sajilo works on i3, sway, Hyprland and other tiling window managers. Its windows have a fixed size, which most of them float by themselves instead of tiling.

With no top bar to click, open it from a **keyboard shortcut** instead. `sajilo-desktop --toggle` opens Sajilo, and running it again closes it. For example:

```bash
# i3 or sway: ~/.config/i3/config or ~/.config/sway/config
bindsym $mod+n exec sajilo-desktop --toggle

# Hyprland: ~/.config/hypr/hyprland.conf
bind = $mainMod, N, exec, sajilo-desktop --toggle
```

Waybar and swaybar show Sajilo's date in their tray, if your bar has a tray enabled. (For the AppImage, use the AppImage's path instead of `sajilo-desktop`.)

If a Sajilo window does get tiled on your setup, add a floating rule for it. Find the window's class with `swaymsg -t get_tree`, `hyprctl clients` or `xprop`.

### Reminders on a tiling setup

Full desktops like GNOME and KDE have all of this built in. A bare window manager may be missing a piece:

- **Use card reminders** (the default). They're Sajilo's own small window and need nothing else. The **Notification** style needs a notification daemon such as `dunst` or `mako` running.
- **Rounded corners look square or black?** The card is see-through at its corners, which needs a compositor (`picom` on i3; sway and Hyprland have one built in). Without one it still works, it just looks boxier.
- **No chime?** Sajilo plays it with `paplay`, `pw-play` or `aplay`, whichever is installed. Almost every distro ships one; if yours doesn't, install `pipewire` or `pulseaudio-utils`.

## When it's installed

Sajilo opens by itself the first time and then starts when you log in. You can turn that off in **Settings › Display › Startup › Launch at login**.

Next: [what's where in Sajilo](/docs/first-steps.html).
