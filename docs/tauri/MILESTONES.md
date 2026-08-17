# Sajilo migration — milestones

Ordered, with tasks and acceptance criteria per milestone. Rationale:
[`PLAN.md`](PLAN.md). File-level layout: [`STRUCTURE.md`](STRUCTURE.md).

Three tracks. After M2 the server and desktop tracks run in parallel.

| Track | Milestones |
|---|---|
| **Shared crates** | M0 · M1 · M2 |
| **Server** | M3 · M5 |
| **Desktop** | M4 · M6 · M7 · M8 · M9 |
| **Both** | M10 · M11 |

Size is relative effort, not a date: **S** ≈ a sitting, **M** ≈ a few, **L** ≈ the
big ones. Legend: ☐ not started · ◐ in progress · ☑ done

---

## M0 — Workspace skeleton ☑

**Goal** Cargo workspace that builds and tests on all three OSes, with nothing
product-specific in it yet.
**Depends on** nothing · **Size** S

### Tasks

- [x] `Cargo.toml` workspace: `crates/*`, `apps/server`, `apps/desktop/src-tauri`
- [x] Empty `sajilo-core`, `sajilo-api`, `sajilo-providers` crates that compile
- [x] `rust-toolchain.toml` pinned to a stable version
- [x] One copy of the calendar data, reachable from both stacks — `data/calendar-events`
      is a symlink to the Swift resource directory. Inverted from the original plan:
      SwiftPM copies a symlink verbatim into the bundle, so the real directory has to
      stay under `Sources/`. Flip it at M11 when the Swift app is deleted.
- [x] Create empty `fixtures/` tree, one directory per source
- [x] `.github/workflows/ci.yml`: `cargo build`, `cargo test --workspace`,
      `cargo clippy -- -D warnings`, `cargo fmt --check` on macOS + Windows + Linux
- [x] Keep the existing Swift CI job untouched (8 `CalendarEventStoreTests` failures
      over truncated BS 2081–2083 source data pre-date this work and remain)

### Acceptance

`cargo test --workspace` passes on all three OSes in CI, and `swift test` still passes.

### Notes

Moving the calendar data first means only one copy exists from day one — no syncing
two directories for the length of the migration.

---

## M1 — Calendar engine and tools (`sajilo-core`) ☑

**Goal** Every pure computation the app does, ported and proven against the Swift
test suite.
**Depends on** M0 · **Size** L

### Tasks

- [x] Port the Swift **tests first** — they are the specification:
      `BikramSambatCalendarTests`, `CalendarEventStoreTests`,
      `UpcomingEventsServiceTests`, `NepaliNumeralsTests`, `NumeralStyleTests`,
      `LandConverterTests`, `NepaliUnitsTests`
- [x] `calendar/bikram_sambat.rs` — BS↔AD conversion, month lengths, year table
- [x] `calendar/nepali_date.rs` — date value type, month/day names (en + ne)
- [x] `calendar/month.rs` — month grid with leading/trailing padding for the UI
- [x] `calendar/events.rs` — embed `data/calendar-events/`, look up by BS date
- [x] `calendar/upcoming.rs` — forward window, limit 100, horizon 400 days
- [x] `numerals.rs` — Devanagari ↔ ASCII, slashed date format
- [x] `nepal_time.rs` — Asia/Kathmandu (+05:45), "today" resolution
- [x] `tools/{land,units,vat,interest}.rs`
- [x] Assert the crate has no `tokio` / `reqwest` / `tauri` dependency

### Acceptance

- BS↔AD matches the Swift suite case for case, including first/last day of a BS year,
  month-length edge years, and the earliest and latest supported dates
- Invalid input returns a typed error, never a panic and never a wrong date
- Land conversion round-trips Hill ↔ Terai ↔ m² within the tolerance the Swift tests use

### Risks

The BS year-length table is the single highest-consequence piece of data in the
product. Diff it against the Swift source line by line, do not retype it.

---

## M2 — Providers and DTOs (`sajilo-providers`, `sajilo-api`) ☑

**Goal** All nine sources fetched and parsed in Rust, with recorded fixtures and a
shared DTO contract.
**Depends on** M0 · **Size** L

### Tasks

- [x] `sajilo-api`: `LoadState<T>` + every DTO ported from `Models/`, all deriving
      `Serialize`, `Deserialize`, `TS` (via the shared `dto!` / `dto_enum!` macros)
- [x] ts-rs generation wired: `cargo test -p sajilo-api --features typescript` writes
      `apps/desktop/src/types/api/*.ts` (one file per type, not one `api.ts`);
      CI fails if the committed output is stale
- [x] `http.rs`: shared client, timeouts, identifying `User-Agent` with contact URL
- [x] `html.rs`: table scraping — rewritten on `scraper` rather than ported, since
      Rust has a real HTML parser and `HTMLTable.swift` only hand-scanned tag pairs
      because Swift does not
- [x] Fixtures recorded live for all nine sources into `fixtures/`
- [x] Parsers ported: NRB forex · NOC fuel · Kalimati vegetables ·
      FENEGOSIDA metals · Open-Meteo weather + AQI · HamroPatro rashifal ·
      Ratopati stations
- [x] `rss/`: parser, article-date resolution, 9-source merge and dedupe.
      The Annapurna Post article-page date resolver is **not** ported — it fetches
      article pages rather than feeds, and on the server that cost is paid once
      for every client rather than per install. Revisit under M3's scheduler,
      where the rate limit belongs.
- [x] One test per provider reading only from `fixtures/`

### Acceptance

- Every provider decodes its fixture into the expected model ✓
- A manual live run against all nine sources succeeds ✓ (every fixture was
  recorded live on 2026-08-17)
- No provider test performs network I/O ✓

### Risks

`ArticleDateResolver` is the subtlest piece — several feeds publish bad or missing
dates. Port its Swift tests verbatim before touching the implementation.

---

## M3 — Server: cache, scheduler, API ☑

**Goal** One deployable binary that keeps every feed warm and serves it cheaply.
**Depends on** M2 · **Size** L

### Tasks

- [x] `config.rs` — port, cache path, per-feed intervals, contact URL, all from env
- [x] `cache.rs` — `RwLock<Snapshot>`, JSON snapshot on disk, warm-start on boot
- [x] `refresh/` — one task per feed on the cadence table, jittered
- [x] `refresh/backoff.rs` — exponential on 429/5xx; a failed refresh keeps the
      previous value and its timestamp, never blanks the feed
- [x] `http/routes.rs` — `/v1/bundle`, per-module endpoints, `/v1/radio/stations`,
      `/v1/meta`, `/v1/health`, `/healthz`
- [x] `http/etag.rs` — content hash → `ETag`, `If-None-Match` → 304
- [x] `/v1/meta` returns `min_client_version` and a notice string
- [x] `/v1/health` reports per-feed last-success time and consecutive failures
- [x] `Dockerfile`, `release-server.yml`. No `HEALTHCHECK` in the image: it
      carries no HTTP client to probe with, and adding one to satisfy Docker is
      weight for nothing — point the orchestrator at `GET /healthz`.

### Acceptance

- A client request never triggers an upstream fetch ✓ (counting fake provider)
- Repeat request with `If-None-Match` returns 304 ✓ (verified live, and against
  weak and comma-listed tags)
- `/v1/bundle?modules=…` returns only the requested modules ✓. Freshness is
  carried per module inside its `LoadState` + `Freshness`, rather than as a
  separate `generated_at` field.
- **24h live run — not done.** A ~10-minute live run had all 8 feeds fresh, and
  NRB failing once at boot then recovering on its own backoff. The full 24h soak
  belongs with the M5 deploy, where there is somewhere for it to actually run.

---

## M4 — Desktop shell ☐

**Goal** A tray app that opens and dismisses a popover on all three OSes. No product
content yet.
**Depends on** M0 · **Size** M

### Tasks

- [x] Scaffold `apps/desktop`: Vite + React + TS + Tailwind, Biome, bun scripts
- [x] `tauri.conf.json` — borderless, transparent, always-on-top, `skipTaskbar`,
      `visible: false`, fixed size; CSP allowing the API host plus `media-src https:`
- [x] `capabilities/default.json` — the minimum permission set for the `main` window
- [x] Plugins: `store`, `notification`, `autostart`, `updater`, `dialog`, `positioner`
- [x] `tray/mod.rs` — build tray, left click toggles the popover, menu with
      Settings and Quit
- [x] `window.rs` — position at the tray, hide on blur, **never close**
- [x] `system/dock.rs` — macOS `set_activation_policy(Accessory)` by default
- [x] Static tray icon plus tooltip for now (dynamic date lands in M6)
- [x] App shell in React: header with back, bottom tab bar, router with placeholder routes

### Acceptance

Tray click opens and dismisses the popover on macOS, Windows, and Linux; no Dock or
taskbar entry appears; closing the popover does not destroy the webview (verify with
a counter that survives a hide/show cycle).

### Risks

Tray-anchored positioning differs per platform and per multi-monitor setup. Budget
time for Linux specifically, where tray hosting varies by desktop environment.

---

## M5 — Server hardening and deploy ☐

**Goal** The server is deployed, observable, and safe for beta clients to depend on.
**Depends on** M3 · runs parallel to M6–M8 · **Size** M

### Tasks

- [ ] `history.rs` — rolling 90-day series for forex and metals; `/v1/forex?history=30`
- [ ] Weather fetched only for cities actually requested, not the whole list
- [ ] API tests against a fake provider set: stale-on-failure, ETag/304,
      bundle composition, module selection
- [ ] `smoke.yml` — one live check per source, scheduled, alerting on parse failure
- [ ] Deploy: container, domain, TLS, restart policy
- [ ] Bake the base URL into desktop builds via env, overridable for local dev

### Acceptance

The server is reachable over TLS, `/v1/health` shows every feed green, and a
deliberately broken parser shows up in health and in the scheduled smoke run before
any user sees it.

---

## M6 — Offline screens: Dashboard, Converter, Day details, Events ☐

**Goal** The half of the product that needs no server, complete.
**Depends on** M1 + M4 · **Size** L

### Tasks

- [ ] `commands/calendar.rs` — `today`, `month`, `convert`, `events_for`, `upcoming`
- [ ] `commands/plans.rs` + `store.rs` — day plans (`dayPlans.v1`), add / delete / list
- [ ] Theme tokens, `Card`, `Segmented`, `TabBar`, `Header`, `CopyRow`, `Empty`
- [ ] Bundle `Noto Sans Devanagari` (woff2 for the UI, TTF for the tray renderer)
- [ ] `routes/dashboard` — date header, month grid, glance cards (placeholders for
      remote modules), up-next, action bar
- [ ] `routes/converter` — BS→AD and AD→BS, swap, today, three copy formats
- [ ] `routes/day` — festival/tithi, three copy formats, day plan add/delete
- [ ] `routes/events` — forward list, limit 100, horizon 400 days
- [ ] `i18n/{en,ne}.json` ported from `.lproj`; numeral style toggle wired
- [ ] **Dynamic tray date**: `tray/title.rs` on macOS; `tray/icon.rs` renders the day
      number with cosmic-text + tiny-skia on Windows/Linux, cached and re-rendered
      once per day at NPT midnight

### Acceptance

- Every screen above works with networking disabled
- Tray shows the correct Nepali date and rolls over at midnight NPT (test by moving
  the clock, not by waiting)
- Switching language and numeral style updates the tray and every screen
- Devanagari renders identically on all three OSes

---

## M7 — Remote screens: Weather, Forex, News, Bazar, Rashifal ☐

**Goal** Every server-backed module, with honest freshness states.
**Depends on** M3 (deployed via M5) + M6 · **Size** L

### Tasks

- [ ] `client.rs` — `/v1/bundle` with ETag, on-disk last-good payload, timeout budget
- [ ] `commands/feeds.rs` — `get_bundle`, `refresh_module`
- [ ] `lib/queries.ts` — fetch on popover open, per-module staleness, manual refresh
- [ ] `StateBanner` component covering stale / unavailable / failed
- [ ] `routes/weather` — current, feels-like, AQI panel, tomorrow, 5-day, sky phase
- [ ] `routes/forex` — favourites, sparkline, converter
- [ ] `routes/news` — merged list, source + relative time, open in browser
- [ ] `routes/bazar` — metals tab with quantity→worth calculator, fuel tab,
      vegetables tab with search and favourites
- [ ] `routes/rashifal` — sign picker, daily reading
- [ ] Dashboard glance cards switch from placeholders to live data

### Acceptance

- Killing the server mid-session degrades every module to labelled stale data;
  restoring it recovers without an app restart
- First launch with no cache and no server shows `unavailable`, not a blank card
- Opening the popover issues one request, and a repeat open within the TTL issues none

---

## M8 — Radio and Tools ☐

**Goal** Audio that survives dismissal, and the four calculators.
**Depends on** M6 · **Size** M

### Tasks

- [ ] `lib/audio.ts` — one `<audio>` element owned above the router, direct stream
- [ ] `routes/radio` — station list from `/v1/radio/stations`, search, play/pause/stop,
      now-playing row pinned at the top
- [ ] `commands/tools.rs` → `routes/tools` — land (Hill/Terai), weight, VAT, interest
- [ ] Verify hidden-window playback on WebView2 and WKWebView
- [ ] Verify playback always starts from a user gesture (no autoplay policy path)

### Acceptance

A station plays continuously across popover dismiss and reopen on all three OSes, and
converter output matches the Rust tests from M1.

### Notes

If a platform throttles media in a hidden window, that is the trigger to move
playback into Rust with `rodio` — not before.

---

## M9 — Notifications, autostart, updater, Settings, backup ☐

**Goal** Everything that makes it a resident app rather than a viewer.
**Depends on** M6 · **Size** L

### Tasks

- [ ] `notify/planner.rs` — next festival eve, holiday eve, day-plan reminder
- [ ] `notify/scheduler.rs` — sleep-until-next, recompute on preference change
- [ ] Persist `last_fired: {kind, date}` so a restart cannot re-fire a reminder
- [ ] Late fire on startup within a 6h window, silent skip beyond it
- [ ] Notification permission request flow per platform
- [ ] `system/autostart.rs` — launch at login; Dock-icon toggle on macOS
- [ ] `commands/backup.rs` — `SajiloBackup` **format version 1**, encode + decode
- [ ] First-run offer: "Import from Sajilo backup"
- [ ] `routes/settings` — parity with `SettingsView.swift`: menu-bar format, language,
      numerals, module toggles, weather city, forex favourites, reminders, dock icon,
      update check, export/import
- [ ] Updater keypair generated, private key into CI secrets, `latest.json` published
      on tag by `release-desktop.yml`

### Acceptance

- A backup exported from the Swift app restores every preference and every day plan
- Restarting the app five times on a reminder day produces exactly one notification
- A fresh install autostarts, and an update is offered and applied end to end

---

## M10 — Parity sign-off and packaging ☐

**Goal** Provable equivalence with the Swift app, and installers for three OSes.
**Depends on** M5 + M7 + M8 + M9 · **Size** M

### Tasks

- [ ] Parity checklist: all 10 screens, every `LoadState` path, every setting
- [ ] Measure cold start, popover-open latency, and idle memory against the Swift app
- [ ] Accessibility pass: keyboard navigation, focus order, labels, contrast
- [ ] Release matrix: macOS `.dmg` notarised, Windows NSIS/MSI, Linux `.deb` + AppImage
- [ ] Windows code signing (or a documented unsigned beta with the SmartScreen note)
- [ ] Load check: 100 simulated clients produce the same upstream traffic as one
- [ ] Publish the beta channel

### Acceptance

The checklist is signed off, installers exist for all three OSes, and upstream traffic
is provably independent of client count.

---

## M11 — Retire the Swift app ☐

**Goal** One stack on `main`.
**Depends on** M10 plus one full beta release cycle · **Size** M

### Tasks

- [ ] Final macOS Sparkle release pointing existing users at the Tauri build
- [ ] Delete `Sources/`, `Tests/`, `Package.swift`, Sparkle, `appcast.xml`,
      the macOS-only workflows, and `scripts/` entries that only served them
- [ ] Rewrite `README.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`,
      `docs/CODING-STANDARDS.md` (Rust + TS), `CONTRIBUTING.md`, `RELEASING.md`
- [ ] Update `CLAUDE.md` and `AGENTS.md` for the new stack
- [ ] Fold `docs/tauri/` into the main docs; keep `PLAN.md` as a historical record

### Acceptance

`main` builds one workspace, CI ships three desktop targets plus a server image, and
no Swift remains.

---

## Sequencing notes

- M1 and M2 are independent of each other; both need only M0.
- M4 needs only M0 — the desktop shell can start the same day as the calendar port.
- M6 and M8 need neither the server nor each other.
- M7 is the only desktop milestone gated on a deployed server.
- M5 runs parallel to M6–M8 and should absorb whatever M7 discovers about the API.
- Do not start M11 until the M10 beta has run for at least one release cycle.

## Decide before M0

Two answers are needed early because later milestones bake them in:

1. **Server host and base URL** — M4 bakes it into the client, and `/v1/meta` only
   helps if it is reachable from the first beta.
2. **Windows signing** — M10 assumes either a certificate exists or the beta ships
   unsigned with a documented warning. Cheaper to decide now than at packaging time.
