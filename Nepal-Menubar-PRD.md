# Nepal Menubar — Product Requirements Document

> Everything Nepal needs, right from your Mac menu bar.

**Status:** v1.0 planning baseline  
**Platform:** Native macOS menu-bar app  
**Technology baseline:** Swift, SwiftUI, macOS 14+  
**Product stance:** Free initially, no ads initially, no account, local-first

## 1. Executive summary

Nepal Menubar is a lightweight native macOS utility for people who need Nepal’s Bikram Sambat (BS) date, Nepali calendar context, and everyday Nepal-specific utilities without opening a browser or a large desktop app.

The app lives permanently in the menu bar. Clicking its date label opens a polished, calendar-first dashboard popover. The calendar is the core trust and acquisition feature; small daily utility cards make the app useful beyond calendar viewing.

The product must feel like a focused Mac utility—not a mobile portal compressed into a small window.

### Product principles

- **Calendar first:** The top of every primary surface is calendar-focused. Remote cards never displace today’s BS date.
- **Local first:** Calendar conversion and essential calendar viewing work fully offline.
- **Useful at a glance:** Remote data is compact, timestamped, cached, and never blocks the dashboard.
- **Native Mac behavior:** Use macOS conventions for menu bar interaction, materials, keyboard support, settings, notifications, accessibility, and launch at login.
- **Trust over breadth:** Never present stale or uncertain remote information as current. Show data source and freshness.
- **No account required:** Preferences, cache, and module configuration remain local to the user’s device.

### Non-goals

- News reader or content feed in the initial release
- Horoscope, radio, AI assistant, or chat
- NEPSE portfolio tracking, trading, or broker integration
- Login, signup, cloud profile, Firebase, or Supabase
- Windows/Linux support before there is user demand

## 2. Users and jobs to be done

| User | Need | Success moment |
|---|---|---|
| Nepali Mac user | See today’s BS and AD date instantly. | Reads the selected BS date directly from the menu bar. |
| Student or professional | Convert dates, copy date formats, and check holidays. | Completes a conversion in seconds with keyboard input. |
| Nepali living abroad | Stay connected to Nepal dates and events. | Sees festivals/holidays and Nepal context at a glance. |
| Everyday utility user | Check trusted Nepal reference values. | Finds a fresh or clearly cached forex/weather value without browser searching. |

## 3. Product scope and release plan

The full product vision is deliberately phased. Calendar accuracy and offline behavior must be proven before adding a broad collection of external data modules.

| Release | Outcome | Included |
|---|---|---|
| **0.1 — Private beta** | Prove the calendar foundation. | Menu-bar BS title, today view, BS↔AD conversion, monthly calendar, bundled holidays/festivals, date copy, settings, offline behavior. |
| **1.0 — Public launch** | Add safe daily-use cards. | Beta scope plus weather, official NRB forex, stale-data cache, location preference, launch at login, optional reminders. |
| **1.1 — Utilities** | Expand local utility value. | Land converter, Nepali/English numerals, lakh/crore formatter, Preeti↔Unicode, number-to-words. |
| **1.2+ — Data modules** | Add source-sensitive cards after validation. | Gold/silver, fuel by region, NEPSE snapshot, widgets, search, module ordering. |

**Launch gate:** Gold, fuel, and NEPSE must not be part of the public 1.0 promise until their source reliability, permitted use, parsing resilience, and freshness behavior are validated.

## 4. Core menu-bar experience

### 4.1 Menu-bar title

The app runs primarily as a persistent menu-bar utility. Its label updates at Nepal local midnight.

Supported display formats:

- `३० साउन`
- `३० साउन २०८३`
- `🇳🇵 ३० साउन`
- `30 Shrawan`
- `२०८३/०४/३०`

Requirements:

- User can choose the date display format in Settings.
- The Dock icon is hidden by default; a preference may show it.
- Clicking the title opens the dashboard popover.
- Escape closes the popover.
- Keyboard navigation and VoiceOver labels are required.

### 4.2 Dashboard popover

Target width is approximately **380 pt**. This is a glanceable dashboard, not the full workspace for every feature.

```text
╭──────────────────────────────────────╮
│ ३० साउन                         ⚙︎   │
│ Saturday · August 15                 │
│                                      │
│ ‹       साउन २०८३             ›     │
│                                      │
│  आ   सो   मं   बु   बि   शु   श    │
│                १    २    ३           │
│  ४    ५    ६    ७    ८    ९   १०   │
├──────────────────────────────────────┤
│ ☀ Kathmandu                    27°   │
├──────────────────┬───────────────────┤
│ USD              │ Gold              │
│ Rs 152.39        │ Rs xxx,xxx        │
├──────────────────┼───────────────────┤
│ NEPSE            │ Petrol            │
│ 2,842 ▲ 0.5%     │ Rs xxx/L          │
├──────────────────┴───────────────────┤
│ ⇄ Date Converter          Tools →    │
╰──────────────────────────────────────╯
```

| Zone | Required content | Interaction |
|---|---|---|
| Calendar header | Nepali weekday, BS date, Gregorian date, verified tithi/paksha, event/holiday indicator. | Opens calendar detail or focused calendar scene. |
| Month preview | Nepali month, weekday headers, current day, festival/holiday highlights. | Previous/next month, Today action, keyboard arrows. |
| Daily cards | Compact selected module cards. Public 1.0 defaults: weather and forex. | Opens focused detail/calculator scene. |
| Actions | Calendar, Convert, Tools, Settings. | Opens dedicated scenes; complex flows stay out of the popover. |

### 4.3 Focused scenes

- **Calendar:** Full monthly calendar, date selection, date details, holidays/festivals, and copy formats.
- **Converter:** Direct keyboard entry for BS→AD and AD→BS, with Today, Swap, and Copy actions.
- **Tools:** Local converters grouped by purpose.
- **Settings:** Standard macOS Settings window, not an overloaded popover sheet.

## 5. Functional requirements

### 5.1 Nepali calendar

| ID | Requirement | Priority |
|---|---|---|
| CAL-01 | Display current BS date, Gregorian date, Nepali and English weekday/month names, and selectable numeral/language formats. | Required |
| CAL-02 | Render an offline monthly Bikram Sambat calendar with previous/next month and Jump to Today. | Required |
| CAL-03 | Show the AD equivalent subtly under each BS date; highlight public holidays and festivals. | Required |
| CAL-04 | Open date detail with BS, AD, weekday, verified tithi/paksha, events, holiday status, and copy formats. | Required |
| CAL-05 | Support keyboard arrows for month navigation and keyboard-friendly controls throughout. | Required |
| CAL-06 | Use a deterministic local conversion engine with trusted fixture tests across its supported date range. | Required |

Calendar data rules:

- BS month lengths and BS↔AD conversion are bundled and deterministic.
- Tithi, festivals, and public holidays are separate versioned datasets with source/provenance metadata.
- The app must not infer religious-calendar data from a generic converter or fetch it on every view.

### 5.2 BS ↔ AD converter

- Two explicit modes: BS→AD and AD→BS.
- Accept direct keyboard input; do not force users through drop-downs.
- Validate supported range and impossible dates before conversion.
- Result includes full weekday and human-readable date.
- Actions: **Today**, **Swap**, and **Copy**.
- Copy output supports Nepali numerals, English numerals, and a localized long-date format.
- Conversion works without network access.

### 5.3 Festivals, holidays, and notifications

- Show an upcoming list of named festivals/public holidays and the number of days remaining.
- Date details show events and public-holiday status.
- Optional notifications include tomorrow’s public holiday, tomorrow’s festival, and selected countdown reminders.
- Notifications are opt-in, individually configurable, scheduled locally, and never used for marketing.

### 5.4 Weather

Card requirements:

```text
Kathmandu

☀ 27°C
Feels like 29°
H 29°  L 21°
Rain 35%
```

- Detail supports today, tomorrow, and five-day forecast.
- Location options: automatic (permission-based), Kathmandu, Pokhara, Lalitpur, or custom.
- Use a structured weather provider for v1; retain the last successful data and its timestamp.
- Refresh target: every 30–60 minutes and on popover open when stale.

### 5.5 Forex

Use the official Nepal Rastra Bank (NRB) forex API as the primary v1 source.

- Show buy/sell rates for favorite currencies.
- Default favorites: USD, AUD, GBP, EUR, JPY; user controls selection.
- Include USD→NPR calculator and reverse NPR→USD conversion.
- Display the source’s published/modified time.
- Refresh target: 6–12 hours; retain last successful data offline.

### 5.6 Gold and silver

Release: **1.2+**, after provider validation.

- Fine gold, tejabi gold where available, and silver.
- Display per tola, per 10 g, and per gram.
- Include a quantity calculator.
- Refresh every few hours.
- Abstract provider behind a protocol such as:

```swift
protocol GoldPriceProvider {
    func latestPrice() async throws -> GoldPrice
}
```

### 5.7 Fuel prices

Release: **1.2+**, after source validation.

- Use Nepal Oil Corporation data where feasible.
- Clearly label the user’s chosen geographic group.
- Show petrol, diesel, kerosene, and LPG as applicable.
- Refresh every 12–24 hours; cache independently.

### 5.8 NEPSE

Release: **1.2+**, only after a stable, permitted source is available.

- Show NEPSE index, absolute/percentage change, and market state.
- Later: turnover, volume, transactions, and a watchlist.
- Do not include portfolio tracking, trading, or broker integration in the initial product.
- Use market-aware refresh logic; do not poll aggressively.

### 5.9 Nepal quick tools

| Tool | Requirement | Release |
|---|---|---|
| Preeti ↔ Unicode | Paste, convert, and copy in both directions. Bundle/test conversion tables locally. | 1.1 |
| Romanized Nepali | Convert common romanized input to Devanagari, keeping editable output. | Later / experimental |
| Nepali numerals | Convert Devanagari digits ↔ Arabic digits. | 1.1 |
| Lakh/crore formatter | Format Indian/Nepali grouping and show lakh/crore interpretation. | 1.1 |
| Number to Nepali words | Generate localized financial/document-friendly words within an explicit supported range. | 1.1 |
| Land converter | Convert Ropani/Aana/Paisa/Daam, Bigha/Kattha/Dhur, sq ft, m², acre, and hectare. | 1.1 |

### 5.10 Settings

- **General:** Launch at login, show Dock icon, language (English / नेपाली / mixed), source attribution.
- **Menu bar:** Display format and numeral preference.
- **Modules:** Enable/disable cards. Drag-to-reorder is deferred until the set is stable.
- **Location:** Auto with permission or manual city/custom location. Fuel region is independent.
- **Forex:** Currency favorites.
- **Notifications:** Per-event notification controls.
- **Search:** `⌘F` is planned after 1.0; it routes users to a date, festival, module, or tool rather than becoming a Raycast replacement.

## 6. Offline, caching, and refresh behavior

| Data | Storage behavior | Refresh rule | Offline UI |
|---|---|---|---|
| Calendar and conversion | Bundled local data and engine. | No network needed; updates only through app/data release. | Fully functional. |
| Festivals and holidays | Bundled, versioned dataset; eventually may accept signed static updates. | App/data update. | Show bundled data and dataset version. |
| Weather | Persist last successful response and timestamp. | 30–60 min; refresh on popover open when stale. | Last value plus “Updated … ago.” |
| Forex | Persist last successful response and source timestamp. | 6–12 h; refresh on open when stale. | Last official value and freshness. |
| Gold/fuel/NEPSE | Persist independently per module. | Source/market-aware; never aggressive polling. | Cached value or compact unavailable state. |

Every remote module uses the same state model:

```text
loading → fresh → stale cached → unavailable/error
```

A blank remote card is not acceptable.

## 7. Technical requirements

| Area | Decision |
|---|---|
| Platform | macOS 14+; GitHub Releases first, App Store readiness later. |
| Language and UI | Swift, SwiftUI, `MenuBarExtra`, native materials, focused scenes/windows as needed. |
| State | Swift Observation / `@Observable`; clear source of truth per feature store. |
| Networking | `URLSession` and Swift concurrency (`async`/`await`). |
| Persistence | `UserDefaults` / `@AppStorage` for preferences; Codable/file cache for remote payloads. Use SwiftData only if structured local history/search demands it. |
| Services | Protocol-backed providers and repositories, enabling source replacement without UI rewrites. |
| System integration | `UserNotifications`, `ServiceManagement`, clipboard APIs, standard keyboard shortcuts. |
| Testing | Swift Testing for pure logic; XCTest/UI tests where needed; calendar fixtures mandatory. |

Recommended structure:

```text
NepalMenu/
├── App/
├── Features/
│   ├── Calendar/
│   ├── Weather/
│   ├── Forex/
│   ├── Gold/
│   ├── Fuel/
│   ├── Nepse/
│   └── Tools/
├── Services/
├── Core/
│   ├── Networking/
│   ├── Cache/
│   └── Models/
└── Resources/
    ├── CalendarData/
    ├── Festivals/
    └── Localizable.xcstrings
```

Data flow:

```text
Remote API → provider service → repository/cache → observable feature store → SwiftUI card/detail

Local calendar engine → calendar store → menu-bar title, dashboard, calendar scene, converter
```

## 8. Quality, privacy, and accessibility

- **Accuracy:** Calendar conversion must be independently testable and never depend on a remote API at runtime.
- **Privacy:** No account, behavioral tracking, cloud profile, or sale of user data. Location is permission-based, with a manual alternative.
- **Reliability:** Each remote provider has a timeout, decoding validation, last-known cache, source timestamp, and replacement path.
- **Accessibility:** VoiceOver labels for Nepali dates and cards; full keyboard traversal; sufficient contrast; adaptable layout.
- **Localization:** English, नेपाली, and mixed modes. Dates and numerals format consistently and copy in the selected representation.
- **Performance:** Local content renders immediately when the popover opens; background refresh does not stall interaction.
- **Security:** HTTPS only; avoid storing credentials; do not log clipboard contents or precise location detail unnecessarily.

## 9. Acceptance criteria for public 1.0

- Menu-bar title shows the selected BS format and changes correctly at Nepal local midnight.
- BS↔AD conversion works offline for the supported range and passes agreed reference fixtures.
- The dashboard renders its local calendar section without waiting for network activity.
- Monthly calendar supports navigation, Today, selection, holiday/festival highlights, and visible AD equivalents.
- Weather and NRB forex show fresh data or a clearly labeled cached/unavailable state with an updated timestamp.
- Settings persist across relaunch: date display, language, location, forex favorites, and launch-at-login choice.
- The app contains no login, signup, embedded advertising, or mandatory cloud service.
- Notification permission is requested only when the user enables a notification option.
- Keyboard and VoiceOver paths work for opening the popover, using main actions, and converting a date.

## 10. Risks and decisions to resolve before implementation

| Risk / decision | Why it matters | Mitigation / owner |
|---|---|---|
| Calendar dataset provenance | A wrong conversion or holiday undermines the entire product. | Select authoritative source/fixture set, document supported range, add regressions. Product + engineering. |
| Tithi and festival correctness | Religious-calendar information may not be safely derived from basic conversion. | Bundle versioned, sourced event data; show only verified attributes. Product. |
| Remote data permissions and stability | Unofficial scraping can break or violate terms. | Prefer official APIs; use provider adapters; postpone unverified modules. Engineering. |
| Devanagari typography | Poor fallback or spacing can make the app look unpolished. | Test on supported macOS versions; validate baseline, spacing, and VoiceOver. Design + QA. |
| Popover density | Too much content in 380 pt creates a cramped mobile-web feel. | Keep calendar first; send deep workflows to focused scenes. Product + design. |
| App Store distribution | Sandboxing, entitlements, and policies can affect later distribution. | Keep dependencies native; document privacy behavior; maintain notarization/App Store readiness. Engineering. |

## 11. Explicitly deferred opportunities

- WidgetKit small, medium, and calendar widgets
- Focused search via `⌘F`
- Module reordering and a personalized compact dashboard
- News links that open in the default browser, never an embedded reader
- NEPSE watchlist after snapshot/market behavior is trustworthy
- Optional signed, static remote calendar-dataset updates without user accounts

## 12. Source and implementation notes

- NRB is the preferred forex source because it provides official documented rate data. Record its published/modified timestamp in the app.
- Use a provider protocol for every remote data source, not only gold.
- A structured weather provider may support v1. DHM alerts can be considered later only if the integration is reliable and permitted.
- A backend is not a launch dependency. If one becomes necessary, limit it to public signed/static dataset delivery—not accounts or personal data.
