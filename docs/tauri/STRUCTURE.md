# Folder structure

File-level layout for the workspace. High-level rationale lives in
[`PLAN.md`](PLAN.md); milestone-by-milestone delivery in [`MILESTONES.md`](MILESTONES.md).

Nothing here is scaffolding for its own sake — every file listed maps to something
the current app already does, or to a decision recorded in `PLAN.md`.

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
│   └── calendar-events/            # 2066–2083, <bs-year>/<month>.json
├── fixtures/                       # recorded upstream HTML/JSON for parser tests
│   ├── nrb/  noc/  kalimati/  fenegosida/
│   ├── open-meteo/  hamropatro/  ratopati/
│   └── rss/
├── docs/tauri/{PLAN,MILESTONES,STRUCTURE}.md
└── .github/workflows/{ci.yml, release-desktop.yml, release-server.yml, smoke.yml}
```

## `crates/sajilo-core` — pure logic, no I/O

```text
crates/sajilo-core/
├── Cargo.toml                      # deps: serde, chrono, thiserror. No reqwest, no tokio.
├── src/
│   ├── lib.rs
│   ├── calendar/
│   │   ├── mod.rs
│   │   ├── bikram_sambat.rs        # BS<->AD conversion, month lengths
│   │   ├── nepali_date.rs          # date value type, month/day names
│   │   ├── month.rs                # month grid for the UI
│   │   ├── events.rs               # (embeds data/calendar-events)
│   │   └── upcoming.rs             # forward window, limit 100, horizon 400 days
│   ├── numerals.rs                 # (Devanagari ↔ ASCII)
│   ├── nepal_time.rs               # (Asia/Kathmandu, +05:45)
│   ├── tools/
│   │   ├── land.rs                 # (Hill / Terai systems)
│   │   ├── units.rs                # (weight)
│   │   ├── vat.rs
│   │   └── interest.rs
│   └── error.rs
└── tests/
    ├── calendar_conversion.rs      # BS<->AD conversion, edge years
    ├── calendar_events.rs          # bundled festival data coverage
    ├── upcoming_events.rs          # forward window, limit, horizon
    ├── numerals.rs                 # Devanagari/ASCII, numeral style
    └── tools.rs                    # land conversion, unit conversion
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
│   ├── html.rs                     # (table scraping helper)
│   ├── nrb.rs                      # forex
│   ├── noc.rs                      # fuel
│   ├── kalimati.rs                 # vegetables
│   ├── fenegosida.rs               # gold / silver
│   ├── open_meteo.rs               # weather + AQI
│   ├── hamropatro.rs               # rashifal
│   ├── ratopati.rs                 # station list
│   └── rss/
│       ├── mod.rs                  # 9 sources, merge + dedupe
│       ├── parser.rs               # feed XML into NewsItem
│       └── article_date.rs         # Annapurna Post article-page date resolver
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
    │   └── planner.rs              # next festival eve, holiday eve, day-plan reminder
    ├── system/
    │   ├── dock.rs                 # macOS set_activation_policy
    │   └── autostart.rs            # launch at login
    └── commands/
        ├── mod.rs
        ├── calendar.rs             # today, month, convert, events_for, upcoming
        ├── feeds.rs                # get_bundle, refresh_module
        ├── plans.rs                # day plans: add, delete, list
        ├── prefs.rs                # read / write preferences
        ├── backup.rs               # format version 1
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

Feature-based, not type-based: each screen owns its route file, its private
components, and its private helpers, instead of those three being split across
three parallel top-level trees. `shared/` is the only thing every feature may
import from; features never import from one another's `_components`/`_lib`
(cross-feature reach, e.g. the dashboard's glance cards reading weather's
`format.ts`, goes through that feature's public root file only). All filenames
are kebab-case — the one exception is `types/api/*.ts`, generated by ts-rs and
never renamed by hand.

```text
apps/desktop/
├── package.json                    # bun; scripts: dev, build, tauri, lint, typecheck
├── vite.config.ts
├── tsconfig.json
├── biome.json
├── index.html
└── src/
    ├── main.tsx
    ├── app.tsx                     # router + shell: back header, bottom tab bar
    ├── index.css                   # Tailwind + theme tokens + @font-face
    ├── i18n/{en,ne}.json
    ├── types/api/*.ts              # GENERATED by ts-rs, one file per type — do not edit
    ├── shared/                     # cross-cutting only — used by 2+ features
    │   ├── components/             # card, icon, header, tab-bar, state-banner, …
    │   ├── lib/                    # ipc.ts, i18n.ts, numerals.ts, load-state.ts, audio.ts, …
    │   └── context/settings-context.tsx   # useSettings() — app-wide prefs, not the Settings screen
    └── features/
        ├── calendar/               # dashboard, converter, day detail, events — one BS-date domain
        │   ├── dashboard.tsx  converter.tsx  day-detail.tsx  events.tsx      # ← routed from app.tsx
        │   ├── _components/        # date-header, month-grid, glance-cards, panchanga-panel, …
        │   └── _lib/copy-formats.ts
        ├── bazar/
        │   ├── bazar.tsx                                                     # ← routed from app.tsx
        │   ├── _components/        # stocks, metals, fuel, vegetables, source-note, …
        │   └── _lib/{format,stock-tone}.ts
        ├── weather/
        │   ├── weather.tsx
        │   ├── _components/{air-quality-panel,forecast-row,weather-atmosphere,weather-icon}.tsx
        │   └── _lib/{format,sky-phase}.ts
        ├── forex/       ├── forex.tsx        _components/forex-rate-row.tsx      _lib/format.ts
        ├── rashifal/    ├── rashifal.tsx     _components/{reading-card,sign-finder,sign-strip}.tsx
        │                                     _lib/{format,signs}.ts
        ├── radio/       ├── radio.tsx  radio-mini-player.tsx   # both mounted from app.tsx
        ├── news/        ├── news.tsx         _components/headline-row.tsx
        ├── settings/    ├── settings.tsx     _components/{display-tab,modules-tab,system-tab,
        │                                       currency-picker,module-row,settings-section}.tsx
        └── tools/       ├── tools.tsx        _components/{land-tab,weight-tab,vat-tab,interest-tab,
                                                quantity-row,result-card,tool-control,tool-field}.tsx
```

## Conventions

- One primary type per Rust file, named after it — carried over from
  `docs/CODING-STANDARDS.md`.
- `src/types/api.ts` is generated. Editing it by hand is a CI failure.
- Frontend never computes a BS date, a unit conversion, or a cache decision. If a
  component needs one, it calls a command.
- `data/calendar-events/` and `fixtures/` are the only large data directories; keep
  both out of broad searches.
