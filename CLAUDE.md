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
and air quality, NRB forex, news from 10 Nepali/English newsrooms plus the
government's notices, Bazar (gold and silver, fuel, Kalimati vegetables),
rashifal, FM radio, world clocks, and Nepali unit tools.

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
| `crates/sajilo-config/` | Pure Rust trust for remote config: signed manifest, hashes, rollback rule, the pack registry, the public keys. |
| `apps/server/` | Background service: fetches and caches every source on a schedule, serves `/v1/*`. |
| `apps/desktop/src-tauri/` | The tray shell: window, tray icon/title, notifications, backup, autostart, updater, commands. |
| `apps/desktop/src/` | The web UI — React 19 + TypeScript + Tailwind, feature-based (`features/<name>/`, `shared/` for cross-cutting). |
| `apps/landing/` | The marketing site: an Astro project (`src/`) plus a Cloudflare Worker (`worker/`) that counts download clicks. Every number on the page is imported from the showcase recording at build time. |
| `apps/showcase/` | The landing page's carousel. Mounts `apps/desktop/src` in a browser with the Tauri IPC layer stubbed, so the site embeds the real app rather than screenshots of it. |
| `apps/showcase-data/` | Records what that stub answers, by running the real engine and parsers over `fixtures/`. Regenerate with `cargo run -p sajilo-showcase-data`. |
| `data/calendar-events/` | Bundled BS calendar events (2066–2083), embedded into `sajilo-core` at build time. |
| `data/config/` | Remote config packs (jokes, kill switches, sources, calendar corrections, directory, announcements): bundled defaults and the live override. See its README. |
| `apps/config/` | Static-assets-only Cloudflare Worker serving the signed packs at `config.sajilo.fyi` (free plan, no script). |
| `apps/config-publish/` | Validates, builds and signs `data/config/` (`check`, `build`, `keygen`). |
| `data/places/` | Every district headquarters plus major towns (English/Nepali names, coordinates, elevation) that weather can be shown for, embedded into `sajilo-core`. |
| `fixtures/` | Recorded upstream HTML/JSON so provider parser tests never touch the network. |

## Commands

```bash
cargo test --workspace       # Rust: core, providers, api, server, desktop
cargo clippy --workspace --exclude sajilo-desktop --all-targets -- -D warnings
cargo fmt --all --check
```

```bash
cargo run -p sajilo-config-publish -- check   # validate data/config/ as the app would
```

```bash
cd apps/showcase
bun run data                 # re-record scenes.json from fixtures/
bun run build                # -> apps/landing/public/assets/app/
```

```bash
cd apps/landing
bun install
bun run dev                  # Astro dev server
bun run check && bun run build
bun run deploy               # build, then wrangler deploy (Cloudflare Workers Builds does this on push to main)
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
- Remote config is data, never code. What the app *says* and *where it
  fetches from* (jokes and reminder copy, feed URLs and provider endpoints,
  TTLs, kill switches, calendar corrections, directory entries) lives in
  `data/config/*.json`: bundled into the binary as the offline default, and
  published as the live override. How the app *computes* (calendar engine,
  parser logic, UI strings, the telemetry allowlist, keys, CSP) stays in code.
  Remote values only ever change through a PR merged to `main`;
  `publish-config.yml` validates, signs, and deploys them. Nothing at
  `config.sajilo.fyi` is edited by hand. Every pack type has a `validate()`
  that bounds what even a correctly signed pack can do; widen it deliberately.
- The landing page shows the app, not pictures of it. Nothing in
  `apps/showcase` or `apps/landing` may hand-write sample data: every value
  rendered comes from the recording (`apps/landing/src/data/showcase.ts` is the
  only place the site reads it), and the recording comes from the same parsers
  the product ships.
