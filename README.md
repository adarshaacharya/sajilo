<div align="center">

<img src="docs/icon.png" alt="Sajilo" width="96" height="96" />

# Sajilo

**Nepal, in your menu bar.**

Bikram Sambat calendar, festivals, markets, news, weather, and everyday Nepali tools,
in a small tray app for macOS, Windows, and Linux.

[Website](https://sajilo.fyi) · [Download](#download) · [Releases](https://github.com/adarshaacharya/sajilo/releases) · [Privacy](#privacy)

[![Latest release](https://img.shields.io/github/v/release/adarshaacharya/sajilo?label=release)](https://github.com/adarshaacharya/sajilo/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)

</div>

---

## Overview

Sajilo answers small, everyday Nepal questions without a trip to a dozen websites:
today's tithi, when Dashain falls, the price of gold per tola, whether an IPO closes
today, or what the dollar is worth at Nepal Rastra Bank.

It lives in the macOS menu bar or the Windows and Linux system tray, opens in a
click, and works in Nepali or English.

- **Offline where it matters.** The calendar, festivals, holidays, and date tools
  are compiled into the app and need no connection.
- **Honest about data.** Everything fetched from the internet carries its fetch
  time. Old values are marked old, and a failed source says so rather than
  showing nothing.
- **No account, no API keys.** Sajilo reads only public sources.

## Features

### Calendar and planning

- Bikram Sambat calendar with tithi, festivals, and public holidays
- BS ↔ AD date conversion and detailed day information
- Upcoming events and personal day plans
- **Keeper**: offline reminders for passports, bills, vehicle renewals, documents
  with expiry dates, and family occasions
- Notifications the evening before festivals and public holidays, and on IPO
  closing days

### Markets and prices

- NEPSE index, sector sub-indices, share prices, and a personal watchlist
- Open IPOs from CDSC
- Nepal Rastra Bank exchange rates
- **Bazar**: gold and silver, fuel prices, and Kalimati vegetable prices

### News and information

- Headlines from Nepali and English newsrooms, including Kantipur, OnlineKhabar,
  The Kathmandu Post, Ratopati, and Gorkhapatra
- Official updates from the Government of Nepal, readable in the app
- Daily rashifal
- FM radio stations from across Nepal

### Weather and time

- Weather and air quality for Kathmandu, Lalitpur, and Pokhara
- World clocks alongside Nepal time

### Everyday tools

- Land area (hill and Terai systems), weight, VAT, and simple interest calculators
- A directory of emergency numbers and government services

### Made for Nepali users

- Full Nepali and English interface
- Devanagari or Latin numerals
- A configurable BS date in the menu bar or tray
- Launch at login, automatic updates, and local backup and restore

## Download

| Platform              | Download                                                           |
| --------------------- | ------------------------------------------------------------------ |
| macOS (Apple Silicon) | [Sajilo-macos-arm64.dmg](https://sajilo.fyi/dl/macos-arm64)        |
| macOS (Intel)         | [Sajilo-macos-x64.dmg](https://sajilo.fyi/dl/macos-x64)            |
| Windows               | [Sajilo-windows-x64.exe](https://sajilo.fyi/dl/windows)            |
| Linux (.deb)          | [Sajilo-linux-amd64.deb](https://sajilo.fyi/dl/linux-deb)          |
| Linux (AppImage)      | [Sajilo-linux-x86_64.AppImage](https://sajilo.fyi/dl/linux-appimage) |

Each link always serves the latest release. Older versions and release notes are on
the [releases page](https://github.com/adarshaacharya/sajilo/releases).

After installation, Sajilo keeps itself up to date. Updates are signed and verified
before they are installed.

### First launch

Builds are not yet signed with an Apple or Microsoft developer certificate, so the
operating system asks for confirmation the first time Sajilo opens.

- **macOS**: the first launch is blocked with *"Sajilo" Not Opened*. Open
  System Settings › Privacy & Security and choose **Open Anyway**. The
  [installation guide](INSTALLATION_INSTRUCTIONS.md) walks through each step with
  screenshots.
- **Windows**: if SmartScreen appears, choose **More info**, then **Run anyway**.

Choose the Apple Silicon build for M-series Macs and the Intel build for older Macs.

## Privacy

Sajilo is local-first. Your plans, reminders, documents, and settings are stored in a
database on your device and never leave it.

To understand how many people use the app, Sajilo sends **one anonymous count per
day**: the app version, the previous version after an update, operating system, CPU
architecture, and days since the last count. The service stores only aggregate
totals, with no account, device identifier, IP address, or in-app activity. It is on
by default and can be switched off in **Settings › System › Privacy**, after which
nothing is sent.

See [SECURITY.md](SECURITY.md) for the full details.

## Data sources

Sajilo reads public pages and keyless public APIs. Each value shows when it was last
fetched.

| Data                        | Source                                                  |
| --------------------------- | ------------------------------------------------------- |
| Exchange rates              | Nepal Rastra Bank                                       |
| NEPSE and share prices      | ShareSansar                                             |
| Open IPOs                   | CDS and Clearing Ltd. (CDSC)                            |
| Gold and silver             | Federation of Nepal Gold and Silver Dealers' Association |
| Fuel prices                 | Nepal Oil Corporation                                   |
| Vegetable prices            | Kalimati Fruits and Vegetable Market Development Board  |
| Weather and air quality     | [Open-Meteo](https://open-meteo.com) (CC BY 4.0)        |
| Rashifal                    | Hamro Patro                                             |
| Radio directory             | Ratopati                                                |
| Official updates            | Government of Nepal                                     |
| News                        | Each publisher's own RSS feed or public endpoint        |

Credit and details for every source are in
[THIRD_PARTY_ATTRIBUTIONS.md](THIRD_PARTY_ATTRIBUTIONS.md).

## Development

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install), at the version pinned in
  [`rust-toolchain.toml`](rust-toolchain.toml)
- [Bun](https://bun.sh)
- The [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your
  operating system

### Run the desktop app

```bash
git clone https://github.com/adarshaacharya/sajilo.git
cd sajilo/apps/desktop
bun install
bun run tauri dev
```

To build an installer for your current platform:

```bash
bun run tauri build
```

### Checks

From the repository root:

```bash
cargo test --workspace
cargo clippy --workspace --exclude sajilo-desktop --all-targets -- -D warnings
cargo fmt --all --check
```

From `apps/desktop`:

```bash
bun run typecheck
bun run lint
```

Provider tests read recorded responses from [`fixtures/`](fixtures) and never make a
network call.

## Project structure

Sajilo is a single Cargo workspace with a Tauri desktop app, a React interface, and a
small set of Cloudflare Workers.

| Path                       | Purpose                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `crates/sajilo-core`       | Calendar engine, numerals, and unit tools. Pure Rust with no I/O.                         |
| `crates/sajilo-providers`  | Fetchers and parsers for every public data source.                                        |
| `crates/sajilo-api`        | Shared data contract. Generates the TypeScript types used by the interface.               |
| `apps/desktop`             | The Tauri app: Rust tray shell in `src-tauri/`, React and TypeScript interface in `src/`. |
| `apps/server`              | Background service that fetches and caches sources and serves them over HTTP.             |
| `apps/landing`             | [sajilo.fyi](https://sajilo.fyi), built with Astro, and its download counter Worker.      |
| `apps/showcase`            | The live app preview on the website, running the real interface with recorded data.      |
| `apps/showcase-data`       | Records the preview data by running the real parsers over `fixtures/`.                    |
| `apps/announcements`       | Worker that serves the occasional notice shown on the Today screen.                       |
| `apps/telemetry`           | Worker that receives the anonymous daily count.                                           |
| `data/calendar-events`     | Bundled Bikram Sambat events, embedded into the app at build time.                        |
| `fixtures`                 | Recorded upstream responses for parser tests.                                             |

## Releasing

```bash
./scripts/bump-version.sh <next-version>
```

This bumps the version, commits, tags, and pushes. CI then builds, signs, and
publishes every platform. See [RELEASING.md](RELEASING.md) for the full process.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md)
before opening a pull request. To report a security concern, follow
[SECURITY.md](SECURITY.md).

## License

Sajilo is released under the [MIT License](LICENSE).
