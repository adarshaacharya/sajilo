# CLAUDE.md

Guidance for Claude Code working in this repository.

## General guidelines

- Prefer clean, scalable code over quick hacks.
- Do not commit changes. Ask the user to commit.
- UI/UX quality is a product requirement, not a finishing touch. Match the
  existing dark, compact, card-based look; keep spacing, type scale, and
  motion consistent across screens.

## What Sajilo is

A Nepal-focused desktop utility that lives in the menu bar / tray: Bikram Sambat
calendar and date converter, day plans, festival and holiday reminders, weather
and air quality, NRB forex, news from 9 Nepali/English sources, Bazar (gold and
silver, fuel, Kalimati vegetables), rashifal, FM radio, and Nepali unit tools.

Everything calendar-related must work offline. Remote modules must never silently
show nothing — they show fresh data, clearly labelled stale data, or an explicit
unavailable/failed state.

## Repository layout

| Path | What |
|---|---|
| `Sources/SajiloApp/` | Current macOS SwiftUI menu-bar app (SwiftPM, macOS 14+, Swift 6.2) |
| `Sources/SajiloApp/Core/` | Calendar engine, providers, networking, persistence, notifications, design |
| `Sources/SajiloApp/Features/` | Screens and `AppModel` (the app-wide observable store) |
| `Sources/SajiloApp/Resources/` | Bundled BS calendar events (2066–2083) and `en`/`ne` strings |
| `Tests/SajiloAppTests/` | Swift Testing suite; the calendar tests are the product spec |
| `docs/` | Architecture, development, coding standards |
| `docs/tauri/` | Tauri 2 cross-platform migration plan and milestones |
| `scripts/`, `appcast.xml` | Packaging, icon generation, Sparkle update feed |

## Commands

```bash
swift test
```

```bash
swift run Sajilo
```

Full Xcode is required for `swift test` (the Swift Testing module ships with
Xcode, not with Command Line Tools).

## Conventions

Read before changing code:

- `docs/ARCHITECTURE.md` — layer rule, state ownership, `LoadState`, provider pattern
- `docs/CODING-STANDARDS.md` — Swift/SwiftUI/concurrency rules, naming, PR bar
- `docs/DEVELOPMENT.md` — toolchain and configuration policy

Non-negotiables from those documents:

- Views never call `URLSession`, parse responses, or convert BS dates.
- UI-facing stores are `@Observable` and `@MainActor`; cross-actor models are `Sendable`.
- No API keys, no `.env`, no account system. Public keyless sources only.
- Provider responses are decoded defensively and modelled separately from domain types.
- Cached values keep their source timestamp.
- New tests use Swift Testing (`#expect` / `#require`), never live network calls.

## Migration in progress

The project is planned to move to one Cargo workspace producing two binaries: a
server that fetches and caches every public source on a schedule, and a Tauri 2
desktop app (Rust tray shell + web UI) for macOS, Windows, and Linux. Scrapers
and the calendar engine live in shared crates used by both. See
`docs/tauri/PLAN.md` and `docs/tauri/MILESTONES.md`.

Until milestone M10 signs off parity, the Swift app stays shippable — do not
degrade it while adding Rust code.
