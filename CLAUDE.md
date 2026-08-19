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
silver, fuel, Kalimati vegetables), rashifal, FM radio, world clocks, and Nepali
unit tools.

Everything calendar-related must work offline. Remote modules must never silently
show nothing — they show fresh data, clearly labelled stale data, or an explicit
unavailable/failed state.

## Stack

One Cargo workspace: pure Rust logic crates, a server binary, and a Tauri 2
desktop app (Rust tray shell + React/TS web UI) targeting macOS, Windows, and
Linux.

## Repository layout

| Path | What |
|---|---|
| `crates/sajilo-core/` | Pure Rust: calendar engine, numerals, tools. No I/O, no Tauri — compiles into the server, the desktop binary, and a plain `cargo test`. |
| `crates/sajilo-providers/` | Fetchers and parsers for every public source (news, weather, forex, bazar, rashifal, radio). |
| `crates/sajilo-api/` | Shared DTO contract; `ts-rs` generates the TypeScript bindings the frontend imports. |
| `apps/server/` | Background service: fetches and caches every source on a schedule, serves `/v1/*`. |
| `apps/desktop/src-tauri/` | The tray shell: window, tray icon/title, notifications, backup, autostart, updater, commands. |
| `apps/desktop/src/` | The web UI — React 19 + TypeScript + Tailwind, feature-based (`features/<name>/`, `shared/` for cross-cutting). |
| `data/calendar-events/` | Bundled BS calendar events (2066–2083), embedded into `sajilo-core` at build time. |
| `fixtures/` | Recorded upstream HTML/JSON so provider parser tests never touch the network. |

## Commands

```bash
cargo test --workspace       # Rust: core, providers, api, server, desktop
cargo clippy --workspace --exclude sajilo-desktop --all-targets -- -D warnings
cargo fmt --all --check
```

```bash
cd apps/desktop
bun install
bun run dev                  # Vite dev server (pairs with `bun run tauri dev`)
bun run tauri dev            # Full desktop app
bun run build                # Frontend build
bun run typecheck
bun run lint
```

## Conventions

Non-negotiables:

- `sajilo-core` carries no `tokio`, `reqwest`, or Tauri type — CI enforces this.
- The frontend never computes a BS date, a unit conversion, or a cache decision.
  If a screen needs one, it calls a command.
- No API keys, no `.env`, no account system. Public keyless sources only.
- Provider responses are decoded defensively and modelled separately from domain
  types (see `crates/sajilo-api`).
- Cached values keep their source timestamp (`LoadState<T>`: Fresh / Stale /
  Unavailable / Failed).
- Every DTO derives `TS`; `apps/desktop/src/types/api/*.ts` is generated —
  editing it by hand is a CI failure.
- Frontend files are kebab-case, feature-scoped (`features/<name>/`, private
  helpers under `_components/`/`_lib/`); `types/api/*.ts` is the one exception,
  since ts-rs names those files after the Rust type.
- New Rust tests are ordinary `#[test]`s reading only from `fixtures/`, never a
  live network call.
