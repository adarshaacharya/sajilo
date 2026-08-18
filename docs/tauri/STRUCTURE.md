# Folder structure

File-level layout for the workspace. High-level rationale lives in
[`PLAN.md`](PLAN.md); milestone-by-milestone delivery in [`MILESTONES.md`](MILESTONES.md).

Nothing here is scaffolding for its own sake — every file listed maps to something
the current Swift app already does, or to a decision recorded in `PLAN.md`.

## Workspace root

```text
sajilo/
├── Cargo.toml                      # [workspace] members = crates/*, apps/server, apps/desktop/src-tauri
├── Cargo.lock
├── rust-toolchain.toml             # pinned stable
├── crates/
│   ├── sajilo-core/
│   ├── sajilo-providers/
│   └── sajilo-api/
├── apps/
│   ├── server/
│   └── desktop/
├── data/
│   └── calendar-events/            # 2066–2083, <bs-year>/<month>.json — moved from Sources/
├── fixtures/                       # recorded upstream HTML/JSON for parser tests
│   ├── nrb/  noc/  kalimati/  fenegosida/
│   ├── open-meteo/  hamropatro/  ratopati/
│   └── rss/
├── docs/tauri/{PLAN,MILESTONES,STRUCTURE}.md
├── .github/workflows/{ci.yml, release-desktop.yml, release-server.yml, smoke.yml}
└── Sources/, Tests/, Package.swift # Swift app — deleted at M11
```

## `crates/sajilo-core` — pure logic, no I/O

```text
crates/sajilo-core/
├── Cargo.toml                      # deps: serde, chrono, thiserror. No reqwest, no tokio.
├── src/
│   ├── lib.rs
│   ├── calendar/
│   │   ├── mod.rs
│   │   ├── bikram_sambat.rs        # ← BikramSambatCalendar.swift
│   │   ├── nepali_date.rs          # ← NepaliDate.swift
│   │   ├── month.rs                # ← CalendarMonth.swift
│   │   ├── events.rs               # ← CalendarEventStore.swift (embeds data/calendar-events)
│   │   └── upcoming.rs             # ← UpcomingEventsService.swift
│   ├── numerals.rs                 # ← NumeralStyle.swift (Devanagari ↔ ASCII)
│   ├── nepal_time.rs               # ← NepalTime.swift (Asia/Kathmandu, +05:45)
│   ├── tools/
│   │   ├── land.rs                 # ← LandConverter.swift (Hill / Terai systems)
│   │   ├── units.rs                # ← NepaliUnits.swift (weight)
│   │   ├── vat.rs
│   │   └── interest.rs
│   └── error.rs
└── tests/
    ├── calendar_conversion.rs      # ← BikramSambatCalendarTests.swift
    ├── calendar_events.rs          # ← CalendarEventStoreTests.swift
    ├── upcoming_events.rs          # ← UpcomingEventsServiceTests.swift
    ├── numerals.rs                 # ← NepaliNumeralsTests + NumeralStyleTests
    └── tools.rs                    # ← LandConverterTests + NepaliUnitsTests
```

This crate must stay free of `tokio`, `reqwest`, and every Tauri type. That is what
lets it compile into the server, the desktop binary, and a plain `cargo test` with no
network in sight.

## `crates/sajilo-api` — the contract

```text
crates/sajilo-api/
├── Cargo.toml                      # deps: serde, chrono, ts-rs (feature "typescript")
├── src/
│   ├── lib.rs
│   ├── load_state.rs               # LoadState<T> — Loading / Fresh / Stale / Unavailable / Failed
│   ├── bundle.rs                   # BundleRequest, BundleResponse, ModuleKey
│   ├── weather.rs                  # ← WeatherSnapshot, AirQuality, WeatherLocation
│   ├── forex.rs                    # ← ForexSnapshot + history series
│   ├── news.rs                     # ← NewsItem, NewsSource
│   ├── bazar.rs                    # ← MetalRate, FuelPrice, VegetablePrice
│   ├── rashifal.rs                 # ← Rashifal, Rashi
│   ├── radio.rs                    # ← RadioStation
│   └── meta.rs                     # min_client_version, notice
└── bindings/                       # ts-rs output, copied into the frontend at build time
```

Every DTO derives `TS`. `cargo test --features typescript` regenerates
`apps/desktop/src/types/api.ts`, so a renamed field breaks the TypeScript build
instead of failing silently at runtime. CI fails if the generated file is stale.

## `crates/sajilo-providers` — fetch and parse

```text
crates/sajilo-providers/
├── Cargo.toml                      # deps: reqwest, scraper, quick-xml, serde_json, tokio
├── src/
│   ├── lib.rs                      # Provider trait, shared http client + UA
│   ├── http.rs                     # timeouts, retry policy, identifying User-Agent
│   ├── html.rs                     # ← HTMLTable.swift (table scraping helper)
│   ├── nrb.rs                      # forex          ← NRBForexProvider.swift
│   ├── noc.rs                      # fuel           ← NOCFuelProvider.swift
│   ├── kalimati.rs                 # vegetables     ← KalimatiMarketProvider.swift
│   ├── fenegosida.rs               # gold / silver  ← FenegosidaMetalProvider.swift
│   ├── open_meteo.rs               # weather + AQI  ← OpenMeteoWeatherProvider.swift
│   ├── hamropatro.rs               # rashifal       ← HamroPatroRashifalProvider.swift
│   ├── ratopati.rs                 # station list   ← RatopatiRadioProvider.swift
│   └── rss/
│       ├── mod.rs                  # 9 sources, merge + dedupe ← RSSNewsProvider.swift
│       ├── parser.rs               # ← RSSParser.swift
│       └── article_date.rs         # ← ArticleDateResolver.swift
└── tests/                          # one test per provider, reading from fixtures/
```

Every parser test loads from `fixtures/`. No test touches the network; the live checks
live in `.github/workflows/smoke.yml` and run on a schedule.

## `apps/server`

```text
apps/server/
├── Cargo.toml                      # deps: axum, tokio, tower-http, sajilo-{api,providers,core}
├── Dockerfile
├── src/
│   ├── main.rs                     # config → state → scheduler → axum serve
│   ├── config.rs                   # env: PORT, CACHE_PATH, feed intervals, contact URL
│   ├── state.rs                    # AppState { cache, history, http }
│   ├── cache.rs                    # RwLock<Snapshot> + JSON warm-start on boot
│   ├── history.rs                  # rolling 90-day series for forex + metals
│   ├── refresh/
│   │   ├── mod.rs                  # spawns one task per feed
│   │   ├── schedule.rs             # interval + jitter
│   │   └── backoff.rs              # exponential on 429 / 5xx, stale-on-failure
│   └── http/
│       ├── mod.rs
│       ├── routes.rs               # /v1/bundle, /v1/{weather,forex,news,bazar,rashifal}
│       │                           # /v1/radio/stations, /v1/meta, /v1/health, /healthz
│       └── etag.rs                 # content hash → ETag, If-None-Match → 304
└── tests/
    ├── api.rs                      # bundle composition, 304 path, module selection
    └── stale.rs                    # failed refresh keeps the previous value + timestamp
```

## `apps/desktop`

### Rust side

```text
apps/desktop/src-tauri/
├── Cargo.toml                      # deps: tauri 2, tauri-plugin-{store,notification,
│                                   #   autostart,updater,dialog,positioner},
│                                   #   sajilo-{core,api}, tiny-skia, cosmic-text
│                                   # feature "direct-fetch" → also sajilo-providers
├── build.rs
├── tauri.conf.json
├── capabilities/
│   └── default.json                # per-window permission set
├── icons/                          # app icons, all platforms
├── assets/
│   └── fonts/NotoSansDevanagari-SemiBold.ttf   # embedded for tray icon rendering
└── src/
    ├── main.rs                     # thin: calls lib::run()
    ├── lib.rs                      # Builder: plugins, state, tray, commands, setup
    ├── state.rs                    # AppState { store, client, tray handle, notify tx }
    ├── window.rs                   # popover: position at tray, hide on blur, NEVER close
    ├── tray/
    │   ├── mod.rs                  # build tray, click → toggle popover, menu (Quit, Settings)
    │   ├── title.rs                # macOS: set_title with the Nepali date
    │   └── icon.rs                 # Windows/Linux: render day number → RGBA → set_icon
    ├── client.rs                   # /v1/bundle, ETag cache, last-good fallback
    ├── store.rs                    # tauri-plugin-store wrapper, AppModel.DefaultsKey names
    ├── notify/
    │   ├── mod.rs
    │   ├── scheduler.rs            # sleep-until-next, recompute on pref change
    │   └── planner.rs              # ← FestivalNotificationPlanner + DayPlanReminderPlanner
    ├── system/
    │   ├── dock.rs                 # macOS set_activation_policy
    │   └── autostart.rs            # launch at login
    └── commands/
        ├── mod.rs
        ├── calendar.rs             # today, month, convert, events_for, upcoming
        ├── feeds.rs                # get_bundle, refresh_module
        ├── plans.rs                # ← DayPlanStore.swift
        ├── prefs.rs                # read / write preferences
        ├── backup.rs               # ← SajiloBackup.swift, format version 1
        └── tools.rs                # land, weight, VAT, interest (delegates to sajilo-core)
```

`tauri.conf.json` essentials:

```jsonc
{
  "app": {
    "windows": [{
      "label": "main",
      "width": 380, "height": 620,
      "decorations": false, "transparent": true,
      "alwaysOnTop": true, "skipTaskbar": true,
      "visible": false, "resizable": false
    }],
    "security": {
      // API host for data; https/media for radio streams played direct by the webview
      "csp": "default-src 'self'; connect-src 'self' https://api.sajilo.app https:; media-src https: blob:; img-src 'self' data: https:; font-src 'self'"
    },
    "trayIcon": { "id": "main", "iconAsTemplate": true }
  },
  "bundle": { "targets": ["dmg", "nsis", "deb", "appimage"] },
  "plugins": { "updater": { "endpoints": ["https://…/latest.json"] } }
}
```

### Frontend

```text
apps/desktop/
├── package.json                    # bun; scripts: dev, build, tauri, lint, typecheck
├── vite.config.ts
├── tsconfig.json
├── biome.json
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx                     # router + shell: back header, bottom tab bar
    ├── index.css                   # Tailwind + theme tokens + @font-face
    ├── routes/
    │   ├── dashboard/
    │   │   ├── index.tsx           # ← DashboardView.swift
    │   │   ├── DateHeader.tsx      # ← DateHeaderView.swift
    │   │   ├── MonthGrid.tsx       # ← MonthCalendarView.swift
    │   │   ├── GlanceCards.tsx     # ← DashboardCardsView.swift
    │   │   ├── UpNext.tsx          # ← DashboardUpNext.swift
    │   │   └── ActionBar.tsx       # ← ActionBarView.swift
    │   ├── converter/index.tsx     # ← DateConverterView.swift (BS↔AD, swap, today, copy ×3)
    │   ├── day/index.tsx           # ← DayDetailView.swift + DayPlanSection.swift
    │   ├── events/index.tsx        # ← UpcomingEventsView.swift
    │   ├── news/index.tsx          # ← NewsView.swift
    │   ├── bazar/
    │   │   ├── index.tsx           # tab shell   ← BazarView.swift
    │   │   ├── MetalsTab.tsx       # gold/silver + quantity→worth calculator
    │   │   ├── FuelTab.tsx
    │   │   └── VegetablesTab.tsx   # search + favourites
    │   ├── rashifal/index.tsx      # ← RashifalView.swift
    │   ├── radio/index.tsx         # ← RadioView.swift (<audio>, direct stream)
    │   ├── tools/
    │   │   ├── index.tsx           # ← ToolsView.swift
    │   │   └── {LandTab,WeightTab,VatTab,InterestTab}.tsx
    │   ├── weather/index.tsx       # ← WeatherDetailView + AirQualityPanel + SkyPhase
    │   ├── forex/index.tsx         # ← ForexDetailView.swift
    │   └── settings/index.tsx      # ← SettingsView.swift
    ├── components/
    │   ├── Card.tsx  Segmented.tsx  TabBar.tsx  Header.tsx
    │   ├── StateBanner.tsx         # renders LoadState: stale / unavailable / failed
    │   ├── CopyRow.tsx             # label + value + copy button
    │   ├── Sparkline.tsx           # ← SparklineView.swift
    │   └── Empty.tsx  Spinner.tsx
    ├── lib/
    │   ├── ipc.ts                  # typed invoke() wrappers over commands/
    │   ├── queries.ts              # fetch-on-open + per-module staleness
    │   ├── numerals.ts             # display-only; math stays in sajilo-core
    │   ├── format.ts
    │   ├── i18n.ts
    │   └── audio.ts                # single <audio> element, survives window hide
    ├── i18n/{en,ne}.json           # ← Resources/{en,ne}.lproj/Localizable.strings
    └── types/api.ts                # GENERATED by ts-rs — do not edit
```

## Conventions

- One primary type per Rust file, named after it — carried over from
  `docs/CODING-STANDARDS.md`.
- `src/types/api.ts` is generated. Editing it by hand is a CI failure.
- Frontend never computes a BS date, a unit conversion, or a cache decision. If a
  component needs one, it calls a command.
- `data/calendar-events/` and `fixtures/` are the only large data directories; keep
  both out of broad searches.
