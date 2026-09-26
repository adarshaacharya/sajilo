---
title: Troubleshooting
description: Fixes for the most common problems, from Sajilo seeming not to open to reminders that never arrive.
section: help
order: 2
---

## I opened Sajilo and nothing happened

Sajilo is a tray app, so it doesn't open a big window. Look for it:

- **Windows:** a **Nepal flag** next to the clock. If you can't see it, click the **^** arrow; new icons hide there. Drag the flag onto the taskbar to keep it visible. See [Install on Windows](/docs/install-windows.html#put-sajilo-on-your-taskbar).
- **macOS:** the **Nepali date** in the menu bar at the top right. On a Mac with a notch, crowded menu bar icons can hide behind it; quit a few menu bar apps, or use a menu bar manager.
- **Linux:** the date in your **top bar**. On GNOME you may need the AppIndicator extension; see [Install on Linux](/docs/install-linux.html#seeing-the-date-in-your-top-bar).

Opening Sajilo again from the Start menu, Launchpad or your applications menu brings its window to the front.

## Linux: it installs, but never opens

On **Ubuntu 22.04, Linux Mint 21, Pop!_OS 22.04** and similar, **Sajilo 0.1.28 and older can't start**: they were built for newer systems. The installer doesn't warn you, so it looks like nothing happens.

**Fix:** install the latest version over the old one:

[Download the .deb](/dl/linux-deb) [Download the .rpm](/dl/linux-rpm) [Download the AppImage](/dl/linux-appimage)

To check, run `sajilo-desktop` in a terminal: if you see `GLIBC_2.39 not found`, this is the problem.

## The browser says the file “isn't commonly downloaded”

Edge and Chrome say this about new apps until enough people have downloaded them; it doesn't mean anything was found in the file. Keep it from the browser's Downloads panel: in **Edge**, point at the file, click **…**, then **Keep** (and **Show more › Keep anyway** if asked); in **Chrome**, click **Keep**. Do this **only** for a file from sajilo.fyi or Sajilo's GitHub releases. [Full Windows steps](/docs/install-windows.html).

## Windows says “Windows protected your PC”

That's SmartScreen. Sajilo's beta builds aren't code-signed yet, so Windows doesn't recognise the publisher. Click **More info**, then **Run anyway**, **only** for a file from sajilo.fyi or Sajilo's GitHub releases.

## macOS says Sajilo can't be opened

Beta builds aren't signed with an Apple certificate yet. Follow the steps in [Install on macOS](/docs/install-macos.html#allow-it-the-first-time). You'll need to do this again after each update.

## Reminders don't arrive

Check these in order:

1. **Is Sajilo running?** Reminders are scheduled on your computer, so Sajilo must be running (closed to the tray is fine). If you quit it, open it again.
2. **Is that reminder on?** See the table in [Reminders](/docs/reminders.html#what-sajilo-reminds-you-about). IPO and SIP reminders also need **Bazar** switched on in **Settings › Modules**, and Keeper reminders need **Keeper**.
3. **Using the Notification style?** Notifications can be turned off for Sajilo in your system settings, and **Do Not Disturb** or **Focus** hides them. Switch to **Card** in **Settings › System › Reminders**: cards aren't affected.
4. **Was the computer off or asleep?** A reminder more than **6 hours late** is skipped rather than delivered out of date.

## News, weather or rates say they're out of date

These come from the internet, so Sajilo shows the last figures it has, with how old they are, when it can't reach a source. Check your internet connection; Sajilo tries again on its own. If one source stays stale for a day while the others update, that website may be down or may have changed. [Tell us](/report.html).

## The calendar is empty for a year

Festivals, tithi and holidays are included for **BS 2066 to 2083**. Other years show only the weekly holidays. Newer years arrive with app updates.

## Something else

[Report an issue](/report.html), or write to [contact@sajilo.fyi](mailto:contact@sajilo.fyi). Say which system you use and what you expected to happen.
