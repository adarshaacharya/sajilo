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
- [x] One copy of the calendar data, reachable from both stacks —
      `data/calendar-events` was originally a symlink into the Swift resource
      directory (SwiftPM copies a symlink verbatim into the bundle, so the real
      directory had to stay under `Sources/`); materialized into a real
      directory at M11 when the Swift app was deleted
- [x] Create empty `fixtures/` tree, one directory per source
- [x] `.github/workflows/ci.yml`: `cargo build`, `cargo test --workspace`,
      `cargo clippy -- -D warnings`, `cargo fmt --check` on macOS + Windows + Linux

### Acceptance

`cargo test --workspace` passes on all three OSes in CI.

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

## M4 — Desktop shell ◐

**Goal** A tray app that opens and dismisses a popover on all three OSes. No product
content yet.
**Depends on** M0 · **Size** M

### Tasks

- [x] Scaffold `apps/desktop`: Vite + React + TS + Tailwind, Biome, bun scripts
- [x] `tauri.conf.json` — borderless, transparent, always-on-top, `skipTaskbar`,
      `visible: false`, fixed size; CSP allowing the API host plus `media-src https:`
- [x] `capabilities/default.json` — the minimum permission set for the `main` window
- [x] Plugins: `store`, `notification`, `autostart`, `dialog`, `opener`, `positioner`.
      **`updater` is declared as a dependency but not registered**: it refuses to
      initialise without a `plugins.updater` block carrying a real public key, and
      that keypair is generated in M9. A placeholder key would only fake a
      readiness the app does not have.
- [x] `tray/mod.rs` — build tray, left click toggles the popover, menu with
      Settings and Quit
- [x] `window.rs` — position at the tray, hide on blur, **never close**
- [x] `system/dock.rs` — macOS `set_activation_policy(Accessory)` by default
- [x] Static tray icon plus tooltip for now (dynamic date lands in M6). Generated
      from the existing `docs/icon.png`; it is a colour icon flagged
      `iconAsTemplate`, so macOS draws it as a silhouette. A purpose-drawn
      monochrome tray asset is worth doing when the dynamic date lands.
- [x] App shell in React: header with back, bottom tab bar, router with placeholder routes

### Acceptance

**Not yet signed off — needs a human at a screen.**

Verified on macOS by running the release binary: the process starts clean, registers
as background-only (the `Accessory` activation policy), and takes no Dock tile.
`osascript` cannot enumerate the menu bar without assistive access, so the tray icon's
appearance and its click behaviour have not been machine-checked.

Outstanding:
- Tray click opens and dismisses the popover on macOS, Windows and Linux
- The webview survives a hide/show cycle. The placeholder screen shows a
  webview age in seconds for exactly this: it must keep climbing across a
  dismiss and reopen. A reset to zero means the window was destroyed, not hidden.
- Windows and Linux have not been run at all — only cross-compiled in CI.

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

## M6 — Offline screens: Dashboard, Converter, Day details, Events ◐

**Goal** The half of the product that needs no server, complete.
**Depends on** M1 + M4 · **Size** L

### Tasks

- [x] `commands/calendar.rs` — `today`, `month`, `convert`, `events_for`, `upcoming`
- [x] `commands/plans.rs` + `store.rs` — day plans (`dayPlans.v1`), add / delete / list
- [x] Theme tokens, `Card`, `Segmented`, `TabBar`, `Header`, `CopyRow`, `Empty`
- [x] Bundle `Noto Sans Devanagari` — 6 woff2 subsets (138 KB) for the UI, rewritten
      to local paths so nothing reaches a font CDN at runtime, plus the variable TTF
      embedded in the tray renderer. OFL 1.1 shipped alongside.
- [x] `routes/dashboard` — date header, month grid, glance cards (placeholders for
      remote modules), up-next, action bar
- [x] `routes/converter` — BS→AD and AD→BS, swap, today, three copy formats
- [x] `routes/day` — festival/tithi, three copy formats, day plan add/delete
- [x] `routes/events` — forward list, limit 100, horizon 400 days
- [x] `i18n/{en,ne}.json` ported from `.lproj`; numeral style toggle wired
- [x] **Dynamic tray date**: `tray/title.rs`, with all four menu-bar formats and a
      rollover that recomputes the wait each time so it self-corrects after sleep.
- [x] `tray/icon.rs` — the day number rendered into the icon with cosmic-text +
      tiny-skia for Windows and Linux, cached per (day, numeral style). Two-pass:
      the first measures real ink, the second blits it centred, because the line box
      spans the font's full ascent-to-descent and centring on it leaves the digits
      against the top edge.

### Acceptance

**Partly signed off.**

- Every screen above works with networking disabled ✓ by construction — the four
  offline screens call only `sajilo-core` commands and no HTTP client is linked
  into the desktop binary at all.
- Tray rollover at NPT midnight ✓ tested by moving the clock, not by waiting.
- Switching language and numeral style ✓ for the tray label (unit-tested across all
  four formats); **not yet verified on screen** — that needs a human at the popover.
- Devanagari rendering on all three OSes — the font is now bundled rather than
  borrowed from the system, and the tray renderer's output was checked by eye and
  is pinned by a centring test. Windows and Linux still have not been *run*.

The screens themselves have not been seen rendering: `osascript` cannot reach the
popover without assistive access. The commands behind them are tested directly.

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

## M8 — Radio and Tools ◐

**Goal** Audio that survives dismissal, and the four calculators.
**Depends on** M6 · **Size** M

### Tasks

- [x] `lib/audio.ts` — one `<audio>` element created against `document`, never
      unmounted, so playback survives both navigation and dismissal. `stop()` clears
      `src` rather than only pausing: a paused live stream keeps its socket open and
      goes on consuming data nobody is hearing.
- [ ] `routes/radio` — the now-playing row, play/pause/stop and the pinned layout are
      done. **The station list is not**: it comes from `/v1/radio/stations`, and the
      API client is an M7 task. The screen currently renders `unavailable` for the
      directory rather than an empty list that would read as "Nepal has no stations".
      Search lands with the list.
- [x] `commands/tools.rs` → `routes/tools` — land (Hill/Terai), weight, VAT, interest.
      All four delegate to `sajilo-core`; the screen computes nothing itself, including
      the lakh/crore grouping, which no `Intl` locale produces.
- [ ] Verify hidden-window playback on WebView2 and WKWebView — **not done**, and it
      is the risk this milestone exists to retire. Needs a real station playing, so it
      is blocked on the station list above.
- [x] Playback always starts from a user gesture: there is no autoplay path in the
      code at all — `play()` is only ever reached from a click handler.

### Acceptance

- Converter output matches the Rust tests from M1 ✓ — the Tools screen renders command
  output directly, and those commands are tested against the same expectations
  (15 tests in `commands.rs`).
- **A station playing across dismiss and reopen — not verified.** No station list yet,
  so nothing has actually been played. The design is in place (a document-owned audio
  element plus a window that hides rather than closes) but the claim is untested on
  all three platforms.

### Notes

If a platform throttles media in a hidden window, that is the trigger to move
playback into Rust with `rodio` — not before.

---

## M9 — Notifications, autostart, updater, Settings, backup ◐

**Goal** Everything that makes it a resident app rather than a viewer.
**Depends on** M6 · **Size** L

### Tasks

- [x] `notify/planner.rs` — next festival eve, holiday eve, day-plan reminder
- [x] `notify/scheduler.rs` — sleep-until-next, recompute on preference change
- [x] Persist `last_fired: {kind, date}` so a restart cannot re-fire a reminder
- [x] Late fire on startup within a 6h window, silent skip beyond it
- [x] Notification permission requested at the moment a reminder is switched on —
      never at launch, and never for a feature nobody asked for. **The flow itself is
      unexercised**: granting it needs a real user at a real dialog.
- [x] `system/autostart.rs` — launch at login; Dock-icon toggle on macOS
- [x] `commands/backup.rs` — `SajiloBackup` **format version 1**, encode + decode
- [x] First-run offer: "Import from Sajilo backup"
- [x] `routes/settings` — parity with `SettingsView.swift`: menu-bar format, language,
      numerals, module toggles, weather city, forex favourites, reminders, dock icon,
      update check, export/import
- [ ] **Updater keypair — not generated, deliberately.** The private key is what
      proves an update came from you: if it leaks anyone can ship a signed update to
      every install, and if it is lost no existing install can ever be updated again.
      That is yours to hold, not mine to create and leave in a scratch directory.
      `scripts/generate-updater-key.sh` does it and refuses to overwrite an existing
      key; `release-desktop.yml` reads the secrets and currently bundles unsigned.
      The updater plugin stays unregistered until `plugins.updater.pubkey` is set.

### Acceptance

- A backup exported from the Swift app restores every preference and every day plan ✓
  — tested against a fixture written in the exact shape `SajiloBackup.swift` encodes
  (ISO-8601 dates, UUID string id, reminder as its raw integer), so the test fails if
  the Rust side drifts from the contract.
- Restarting five times on a reminder day produces exactly one notification ✓ at the
  logic level: `LastFired` is persisted and `should_fire_late` is tested across five
  repeat calls. **Not verified with the real notification centre.**
- A fresh install autostarts, and an update is offered and applied end to end —
  **not verified.** Autostart is wired and reads its state back from the OS rather
  than assuming success, but registering a login item and applying a signed update
  both need a real install, and the update half needs the keypair above.

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

## M11 — Retire the Swift app ◐

**Goal** One stack on `main`.
**Depends on** M10 plus one full beta release cycle · **Size** M

**Note:** the deletion below happened on explicit instruction, ahead of its
formal M10 gate — M10's parity checklist, notarization, Windows signing, and
beta channel are still `[ ]`. Nothing here claims those are done; only that
the Swift source and its docs no longer exist.

### Tasks

- [ ] Final macOS Sparkle release pointing existing users at the Tauri build —
      **not applicable**: no Sparkle release channel was ever published, so
      there was no existing install base to redirect.
- [x] Delete `Sources/`, `Tests/`, `Package.swift`, Sparkle, `appcast.xml`,
      the macOS-only workflows (`release.yml`, the `swift test` job in `ci.yml`),
      and `scripts/` entries that only served them
      (`AppBundleInfo.plist`, `AppIcon.icns`/`.iconset`, `make-app-icon.swift`,
      `package-release.sh`, `run-local-app.sh`, `update-appcast.sh`)
- [x] Materialize `data/calendar-events` (was a symlink into
      `Sources/SajiloApp/Resources/CalendarEvents`) into a real directory —
      the one thing that would have silently broken `sajilo-core`'s embedded
      data the moment `Sources/` was gone
- [x] Rewrite `README.md`, `CONTRIBUTING.md`, `RELEASING.md`; delete
      `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/CODING-STANDARDS.md`
      (Swift-only; Rust/TS conventions live in `CLAUDE.md` and `docs/tauri/`)
- [x] Update `CLAUDE.md` for the new stack (`AGENTS.md` is a symlink to it)
- [ ] Fold `docs/tauri/` into the main docs — not done; `PLAN.md`/`MILESTONES.md`
      still live under `docs/tauri/` as the historical record

### Acceptance

`main` builds one workspace (verified: `cargo build --workspace`,
`cargo test --workspace`, `bun run build` all pass after the deletion). CI still
needs to be run for real to confirm the updated `ci.yml`/`release-desktop.yml`
against three desktop targets plus a server image — that hasn't happened yet.
No Swift source, tests, or Swift-specific docs remain.

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
