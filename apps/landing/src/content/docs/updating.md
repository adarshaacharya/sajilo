---
title: Updating Sajilo
nav: Updating
description: How Sajilo keeps itself up to date on Windows, macOS and Linux, what the update messages mean, and how to update by hand.
section: help
order: 1
---

Sajilo **updates itself**. It checks when it starts and every half hour, and by default downloads and installs a new version on its own. You just restart it when you're ready.

## What you'll see

1. While an update downloads, the top of Sajilo shows **Updating…**.
2. When it's installed, you'll see **Restart to update**: at the top of Sajilo, and in the tray icon's menu as **Restart to update to v…**.
3. Click it. Sajilo closes and opens again on the new version.

Until you restart, you keep using the version you had. Nothing is lost when it restarts.

**See what's new** in the update window shows what changed; so does the [releases page](/releases.html).

## Choose to be asked first

In the update window, untick **Automatically download and install future updates**. Sajilo will then show **Update available** and wait for **Install & restart**. **Later** hides it for a day.

## Check by hand

**Settings › System › Updates › Check for updates.** It says **You're on the latest version.**, or offers **Install update**, then **Restart now**. Your version is under **Settings › About**.

## On each system

| System | How it updates |
|---|---|
| **Windows** | The new installer runs in the background. |
| **macOS** | Sajilo replaces itself. Because beta builds aren't signed by Apple yet, macOS may ask you to confirm it again, as the first time; see [Install on macOS](/docs/install-macos.html#allow-it-the-first-time). |
| **Linux, AppImage** | The AppImage file replaces itself. |
| **Linux, .deb** | Sajilo installs the new package, which asks for your **password**, like any system update. |

## Update by hand

You can always download the latest version from the [download section](/#download) and install it over the one you have: your dates, plans and settings are kept.

> **Stuck on an old version?** If Sajilo never starts on your computer, it can't update itself either. Install the latest version by hand. On Linux, see [it installs, but never opens](/docs/troubleshooting.html#linux-it-installs-but-never-opens).
