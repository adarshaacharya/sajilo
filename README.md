<p align="center">
  <img src="docs/icon.png" alt="Sajilo" width="120" height="120">
</p>

# Sajilo

A small desktop companion for Nepal: Bikram Sambat dates, festivals, day plans,
and everyday Nepali tools. Sajilo lives in the system tray on macOS, Windows, and
Linux.

Built with Tauri 2, Rust, and React. The calendar and date tools work fully
offline. Data from public sources is handled separately and always shows
whether it is fresh, stale, or unavailable — never silently blank.

## Platforms

| Platform | Desktop package |
| --- | --- |
| macOS | `.dmg` |
| Windows | NSIS installer |
| Linux | `.deb` and AppImage |

## What Sajilo includes

- Bikram Sambat calendar, AD conversion, tithi, festivals, and public holidays
- Personal day plans and reminders
- Upcoming events and detailed day information
- Weather and air quality, NRB forex, Bazar (gold/silver, fuel, Kalimati
  vegetables), stocks, news from 9 Nepali/English sources, rashifal, and radio
- World clocks alongside Nepal time
- Land, weight, VAT, and simple-interest tools
- Nepali and English interface options, with Devanagari or English numerals
- Tray date display designed for each platform

## Install

**[Download Sajilo](https://github.com/adarshaacharya/sajilo/releases)**

Choose the newest release, then download the installer for your platform. Beta
releases are marked as prereleases on that page.

### macOS

Open the downloaded `.dmg`, then drag **Sajilo.app** into the Applications folder.

### First launch

This is a beta release and is not yet Apple-notarized, so macOS blocks it the first time with *"Apple could not verify Sajilo is free of malware"*. To allow it:

1. Open **Sajilo.app**, then click **Done** on the warning.
2. Go to **System Settings → Privacy & Security**.
3. Scroll down to **Security**. A line reads *"Sajilo" was blocked to protect your Mac*.
4. Click **Open Anyway** and authenticate.
5. Open **Sajilo.app** again.

You only do this once. Sajilo then lives in the menu bar — it has no Dock icon or window unless you turn one on in Settings.

> On macOS 14 and earlier you could Control-click the app and choose **Open** instead. macOS 15 removed that shortcut, so the steps above are the only way now.

## Run from source

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) 1.97.1 (the repository pins this version)
- [Bun](https://bun.sh/)
- The system dependencies required by [Tauri v2](https://v2.tauri.app/start/prerequisites/) for your operating system

Clone the repository and install the desktop dependencies:

```bash
git clone https://github.com/adarshaacharya/sajilo.git
cd sajilo
cd apps/desktop
bun install
```

Start the desktop app:

```bash
bun run tauri dev
```

Build a release package for your current platform:

```bash
bun run tauri build
```

Run the Rust workspace tests from the repository root:

```bash
cargo test --workspace
```

## Project layout

```text
crates/              Shared Rust calendar engine, data models, and providers
apps/desktop/        Tauri desktop app (Rust tray shell + React interface)
apps/server/         Scheduled cache and API for public data sources
data/calendar-events/ Bundled Bikram Sambat event data
docs/tauri/          Migration plan and milestones
```

For the implementation status and remaining release work, see the
[Tauri milestones](docs/tauri/MILESTONES.md).

## License

Sajilo is available under the [MIT License](LICENSE). Calendar-data notices are
in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
