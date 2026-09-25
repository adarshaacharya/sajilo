---
title: Install on Linux
nav: Linux
description: Install Sajilo on Ubuntu, Debian, Linux Mint, Pop!_OS and other 64-bit Linux, and make its date show in your top bar.
section: start
order: 3
---

Sajilo runs on **64-bit (x86_64) Linux**. There are two downloads:

| Download | Use it on |
|---|---|
| **.deb** | Ubuntu, Debian, Linux Mint, Pop!_OS, Zorin, elementary |
| **AppImage** | Anything else: Fedora, Arch, openSUSE, … |

## With the .deb

Download **Sajilo-linux-amd64.deb** from the [download section](/#download), then install it from the folder you saved it in:

```bash
sudo apt install ./Sajilo-linux-amd64.deb
```

`apt` installs what Sajilo needs along with it. Open **Sajilo** from your applications menu.

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

## When it's installed

Sajilo opens by itself the first time and then starts when you log in. You can turn that off in **Settings › Display › Startup › Launch at login**.

Next: [what's where in Sajilo](/docs/first-steps.html).
