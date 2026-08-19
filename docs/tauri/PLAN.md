# Sajilo → Tauri 2 + shared backend

Status: complete. The Swift app has been retired; this document is kept as the
historical rationale for the decisions below.

## Why

Sajilo was originally a macOS-only SwiftUI menu-bar app (~11.3k LOC plus ~4.5k
LOC of Swift Testing) where every client scraped every source directly. Two
problems followed from that:

1. Shipping on Windows and Linux means two more native rewrites.
2. When an upstream site changes its HTML, every installed copy breaks until every
   user installs an update.

This plan moves the product to one Cargo workspace producing two binaries:

- a **server** that fetches and caches every public source on a schedule and serves
  one small API, so upstream sites see one client instead of N, and a parser fix
  ships as a deploy;
- a **Tauri 2 desktop app** (Rust tray shell + web UI) for macOS, Windows, and Linux.

Non-goal: changing the product. Every screen ships with the same behaviour and the
same data sources — Dashboard, Date converter, Date details, News, Bazar (gold and
silver, fuel, vegetables), Rashifal, Radio, Tools, Weather, Settings.

## Workspace

Top level below; file-level layout for every crate, the server, and the Tauri app is
in [`STRUCTURE.md`](STRUCTURE.md).

```text
sajilo/
├── Cargo.toml                      # workspace root
├── crates/
│   ├── sajilo-core/                # pure, no I/O: BS↔AD engine, numerals,
│   │                               # land/weight/VAT/interest, domain models, LoadState
│   ├── sajilo-providers/           # fetch + parse per source
│   │   ├── nrb.rs  noc.rs  kalimati.rs  fenegosida.rs
│   │   ├── open_meteo.rs  hamropatro.rs  ratopati.rs
│   │   └── rss/                    # 9 news sources + article-date resolution
│   └── sajilo-api/                 # request/response DTOs shared by server and client
├── apps/
│   ├── server/
│   │   └── src/
│   │       ├── main.rs  config.rs
│   │       ├── http/{routes.rs, etag.rs}
│   │       ├── refresh.rs          # per-feed scheduler: interval, jitter, backoff
│   │       ├── cache.rs            # RwLock<Snapshot> + disk warm-start
│   │       └── history.rs          # rolling series for forex/metal sparklines
│   └── desktop/
│       ├── src-tauri/src/
│       │   ├── main.rs  tray.rs  commands.rs
│       │   ├── client.rs           # ETag-aware API client
│       │   ├── store.rs            # prefs, day plans, last-good payload
│       │   ├── notify.rs
│       │   └── calendar.rs         # wraps sajilo-core; never hits the server
│       ├── src/                    # React + TS + Tailwind
│       │   ├── routes/             # dashboard, converter, day, news, bazar,
│       │   │                       # rashifal, radio, tools, settings
│       │   ├── components/  lib/
│       │   └── i18n/{en,ne}.json   # ported from Resources/*.lproj/Localizable.strings
│       └── tauri.conf.json
├── data/calendar-events/           # 2066–2083 JSON, embedded in both binaries
└── docs/tauri/
```

`sajilo-api` existing as its own crate is what stops server and client DTOs from
drifting: a field rename that breaks the client fails at compile time, not at runtime.

Sharing `sajilo-providers` between both binaries costs nothing and buys an escape
hatch — a `direct-fetch` cargo feature lets the desktop app scrape sources itself if
the server is down or ever retired. Same code, no second implementation.

## Layer rule

```text
React view
    ↓ invoke("...")
Tauri command
    ↓
desktop client.rs  ──HTTP──▶  server /v1/*  ──▶ cache ──▶ sajilo-providers ──▶ upstream
    │                                                (scheduled, never on request path)
    └──▶ sajilo-core (calendar, converters — local, offline, no server)
```

Rules carried over from `docs/ARCHITECTURE.md`, unchanged:

- Views never fetch, parse, or convert BS dates.
- Every remote module carries an explicit freshness state; values never silently vanish.
- The calendar engine is pure, offline, and the most heavily tested code in the product.

`LoadState` moves to `sajilo-api` and is serialised over both boundaries:

```rust
#[derive(Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum LoadState<T> {
    Loading,
    Fresh { value: T, updated_at: DateTime<Utc> },
    Stale { value: T, updated_at: DateTime<Utc> },
    Unavailable,
    Failed { message: String },
}
```

## Where each Swift capability lands

| Current (Swift) | Target | Notes |
|---|---|---|
| `MenuBarExtra` + `NSApplicationDelegate` | `tauri::tray::TrayIcon` + hidden `WebviewWindow` | Popover = borderless always-on-top window anchored to tray (`tauri-plugin-positioner`) |
| `BikramSambatCalendar` (270 LOC) | `crates/sajilo-core/calendar` | Pure port; Swift test fixtures ported first as the spec |
| `Resources/CalendarEvents/*` | `data/calendar-events/`, embedded | Same JSON, no format change |
| `RemoteFeed` cache envelope | `apps/server/src/cache.rs` + client last-good copy | Freshness decided server-side, degraded gracefully client-side |
| `UserDefaults` (~28 keys, `AppModel.DefaultsKey`) | `tauri-plugin-store` JSON, same key names | Keeps the backup format compatible |
| `NRBForexProvider`, `NOCFuelProvider`, `KalimatiMarketProvider`, `FenegosidaMetalProvider`, `HamroPatroRashifalProvider`, `RatopatiRadioProvider` | `crates/sajilo-providers` (`reqwest` + `scraper`) | Runs on the server; no CORS question anywhere |
| `RSSParser`, `RSSNewsProvider`, `ArticleDateResolver/Store` | `sajilo-providers/rss` (`quick-xml`) | 9 sources merged and deduped server-side |
| `OpenMeteoWeatherProvider` | `sajilo-providers/open_meteo.rs` | Keyless; proxied for uniform caching |
| `RadioPlayer` (AVFoundation) | `<audio>` in the webview, **stream direct from the station** | Server only serves the station list |
| `NotificationScheduler`, `FestivalNotificationPlanner`, `DayPlanReminderPlanner` | `apps/desktop/src-tauri/notify.rs` | Local, offline; see below |
| `LaunchAtLogin` (`ServiceManagement`) | `tauri-plugin-autostart` | |
| `AppUpdater` (Sparkle + `appcast.xml`) | `tauri-plugin-updater` + `latest.json` | Appcast retired at M11 |
| `showsDockIcon` / activation policy | `app.set_activation_policy()` (macOS) | Windows/Linux: taskbar toggle or drop the setting |
| `SajiloBackup` export/import | `tauri-plugin-dialog` + `fs` | **Format version stays 1** — it is the migration bridge |
| `Theme.swift` / `Components.swift` | Tailwind tokens + shared components | Dark-first, matches current screenshots |
| `AppLanguage` + `.lproj` strings | `i18n/{en,ne}.json` | Devanagari/English numerals stay a pure function in `sajilo-core` |

## Server

### Refresh cadence

The scheduler fetches on its own timetable regardless of client count. A client
request **never** triggers an upstream fetch — it always gets the last good snapshot.

| Feed | Interval | Notes |
|---|---|---|
| Forex (NRB) | 6h | plus rolling 90-day history for the sparkline |
| Gold / silver (FENEGOSIDA) | 6h | history kept |
| Fuel (NOC) | 12h | changes rarely |
| Vegetables (Kalimati) | 6h | published once daily |
| News (9 RSS) | 20 min | merged and deduped server-side |
| Rashifal | 12h | per sign |
| Weather (Open-Meteo) | 15 min | only for cities actually in use |
| Radio stations | 24h | list only; streams are direct |
| Calendar / festivals | never | bundled in the client |

Every schedule is jittered. Backoff is exponential on 429 and 5xx. The `User-Agent`
identifies the app and carries a contact URL. A failed fetch keeps serving the
previous value as stale rather than blanking the feed.

### API

```
GET /v1/bundle?modules=weather,forex,news,bazar,rashifal&city=kathmandu&sign=mesh
GET /v1/weather?city=          GET /v1/forex?history=30
GET /v1/news?lang=             GET /v1/bazar
GET /v1/rashifal?sign=         GET /v1/radio/stations
GET /v1/meta                   GET /v1/health
```

`/v1/bundle` is what the tray calls: one round trip on popover open instead of six.
Every response carries a per-module `generated_at` and an `ETag`; the client sends
`If-None-Match` and normally gets a 304 of a few bytes. `/v1/meta` carries
`min_client_version` and a notice string, so a breaking parser change or a forced
update has somewhere to land.

### Hosting and data

One binary, one container, `/healthz`. Cache lives in memory with a JSON snapshot on
disk for warm restart. No database until forex/metal history outgrows the rolling
in-memory window — at that point it is one SQLite file, not Postgres.

<!-- ponytail: in-memory + JSON snapshot. Move history to SQLite when the client
     asks for ranges longer than the window we keep. -->

No auth, no accounts, no API keys, no user data. Everything served is public, so the
server stays a dumb cache and the privacy story does not change. The
`docs/DEVELOPMENT.md` configuration policy still holds.

### Client behaviour when the server is unreachable

The desktop app keeps its own on-disk copy of the last good payload. Server down →
the existing `Stale` path, clearly labelled, exactly like today's offline behaviour.
Calendar, converters, day plans, and reminders keep working with no network at all.

## Known hard parts and their fixes

### Tray text

The product's signature is the Nepali date rendered in the menu bar. macOS is the
only platform with a tray text label, and Windows/Linux tray slots are 16–22px, so
a full `३१ साउन २०८३` will never fit there.

| OS | Tray shows | Full date |
|---|---|---|
| macOS | `set_title("३१ साउन २०८३")` | same |
| Windows | rendered icon, **day number only** (`३१`) | tooltip + popover header |
| Linux | same rendered icon | tooltip + popover header |

Icon rendering: `cosmic-text` (Devanagari shaping via rustybuzz) → `tiny-skia` pixmap
→ `tray.set_icon(Image::new_owned(rgba, w, h))`, with the Devanagari TTF bundled via
`include_bytes!`. The date changes once per day in NPT, so render once and cache the
pixmap.

Ship the static-icon-plus-tooltip fallback in M4 and land the rendered icon in M6.

### Radio

Streams play through an `<audio>` element straight from the station — no proxying,
no server bandwidth. The window is **hidden, never closed**, so the webview and the
stream survive dismissal. Two things to verify rather than assume (M8): that WebView2
and WKWebView do not suspend media in a hidden window, and that playback always
starts from a user gesture so autoplay policy never applies. If a platform does
throttle it, that is the trigger to move playback to `rodio` — not before.

### Scheduled notifications

`tauri-plugin-notification` fires immediately and has no desktop scheduler. A Rust
task computes the next festival eve, holiday eve, and day-plan reminder, sleeps until
it, and recomputes when preferences change. Two details that matter:

- **Dedupe across restarts.** Persist `last_fired: {kind, date}`. Tray apps restart
  often; without this the same festival reminder fires repeatedly.
- **Late fire on startup.** If a reminder passed while the app was quit and is still
  within a 6h window, fire once; otherwise skip silently.

Reminders do not survive the app being quit — same as any tray utility, and it gets
one line in Settings.

### Fonts

Bundle `Noto Sans Devanagari` (subset, woff2) in the frontend with
`font-display: block`, and bundle the same TTF in Rust for the tray renderer so tray
and popover glyphs match. Windows has no usable Devanagari default; this is not optional.

### Signing and packaging

- **macOS** — existing notarization secrets carry over; `.app` / `.dmg`.
- **Windows** — NSIS/MSI. Needs a certificate or every install hits SmartScreen.
  Cheapest credible option is Azure Trusted Signing. Acceptable interim: ship
  unsigned, document the click-through, add the cert before leaving beta.
- **Linux** — `.deb` + AppImage, unsigned is normal.
- **Updater** — generate the Tauri updater keypair at M9, private key in CI secrets,
  `latest.json` published on tag.

CI becomes a three-OS matrix plus a server image build, replacing the macOS-only
workflows in `.github/workflows/`.

## Testing

- Rust unit tests are the correctness floor: calendar conversion (happy path,
  boundaries, invalid input), numerals, land/weight/VAT/interest, cache freshness,
  backup round-trip.
- Provider parsers are tested against **recorded HTML/JSON fixtures**, never live
  network.
- Server API tests run against a fake provider set, asserting stale-on-failure,
  ETag/304, and bundle composition.
- One live smoke test per source, ignored by default, run on a schedule against the
  server so upstream HTML changes surface before users see them.
- Frontend tests stay minimal: routing and formatting only.

## Rollout

The server deployed first, beta desktop builds pointed at it, and Tauri builds
shipped as a beta channel alongside the Swift release. The Swift app was
deleted once parity was signed off (M10/M11) — `Sources/`, `Tests/`,
`Package.swift`, and `appcast.xml` are gone.

Milestones, tasks, and acceptance criteria: [`MILESTONES.md`](MILESTONES.md).
Folder structure: [`STRUCTURE.md`](STRUCTURE.md).
