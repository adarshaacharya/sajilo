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

| Platform | Download |
| --- | --- |
| macOS (Apple Silicon) | [Sajilo-macos-arm64.dmg](https://github.com/adarshaacharya/sajilo/releases/latest/download/Sajilo-macos-arm64.dmg) |
| macOS (Intel) | [Sajilo-macos-x64.dmg](https://github.com/adarshaacharya/sajilo/releases/latest/download/Sajilo-macos-x64.dmg) |
| Windows | [Sajilo-windows-x64.exe](https://github.com/adarshaacharya/sajilo/releases/latest/download/Sajilo-windows-x64.exe) |
| Linux (.deb) | [Sajilo-linux-amd64.deb](https://github.com/adarshaacharya/sajilo/releases/latest/download/Sajilo-linux-amd64.deb) |
| Linux (AppImage) | [Sajilo-linux-x86_64.AppImage](https://github.com/adarshaacharya/sajilo/releases/latest/download/Sajilo-linux-x86_64.AppImage) |

Each link always points at the current release — no need to visit the
[releases page](https://github.com/adarshaacharya/sajilo/releases) unless you
want an older version or release notes.

### macOS

Open the downloaded `.dmg`, then drag **Sajilo.app** into the Applications folder.

- Apple Silicon Macs (M1, M2, M3, M4) need the **`aarch64`** download.
- Intel Macs need the **`x64`** download.

### First launch

Current beta builds are not yet Apple-signed or notarized. If macOS says
**“Sajilo is damaged and can’t be opened”**, only continue if you downloaded it
from Sajilo’s GitHub Releases page above. In Terminal, run:

```bash
mkdir -p ~/Applications
ditto /Applications/Sajilo.app ~/Applications/Sajilo.app
xattr -cr ~/Applications/Sajilo.app
open ~/Applications/Sajilo.app
```

This creates a user-owned copy in `~/Applications` and removes macOS’s download
quarantine from that copy. You only need to do this once per beta build. Sajilo
then lives in the menu bar — it has no Dock icon or window unless you turn one
on in Settings.

> Proper Apple code signing and notarization are planned before the stable release;
> this workaround is temporary beta-installation guidance.

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
```

## License

Sajilo is available under the [MIT License](LICENSE). Full detail on every
data source it reads, and credit to each, is in
[THIRD_PARTY_ATTRIBUTIONS.md](THIRD_PARTY_ATTRIBUTIONS.md).
