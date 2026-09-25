---
title: Radio
description: Listen to Nepali FM stations, pin your favourites, and keep listening while you work.
section: features
order: 12
screen: /radio
---

The **Radio** tab lists FM stations from across Nepal.

## Listen

- **Click a station** to play it. Click it again to pause.
- **Search** by name or frequency.
- Hover over a station and click the **pin** to keep it at the top, under **Pinned**.

While a station plays, the **Now playing** bar shows it, with **volume**, **pause** and **stop**. Sajilo remembers your volume.

## Keep listening

The radio **keeps playing when you close Sajilo's window**, or move to another tab: closing only hides the window. On other tabs, a small player sits above the tab bar; click it to come back to Radio, or hide it.

To stop, click **Stop**. Quitting Sajilo also stops the radio.

## If a station won't play

Stations stream straight from their own servers, so one may be off air or slow. Sajilo tells you when a station **is not responding** or **has no playable stream**; try another, or try again later.

On **Linux**, Sajilo plays through your system's media plugins. The AppImage brings its own. With the .deb, if some stations never start, installing these usually fixes it:

```bash
sudo apt install gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-libav
```

Radio can be switched off in **Settings › Modules › Radio**.
