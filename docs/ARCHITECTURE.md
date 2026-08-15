# Sajilo architecture

## Direction

Sajilo uses a **feature-oriented, local-first architecture**. It deliberately avoids both a giant `ContentView` and ceremony-heavy Clean Architecture.

```text
Sources/SajiloApp/
├── App/                    # App entry, scene composition, app-wide dependency assembly
├── Core/                   # Shared, reusable code with no feature ownership
│   ├── Models/             # Small cross-feature value types
│   ├── Formatting/         # Nepali numerals, date display formatting
│   ├── Networking/         # HTTP client abstractions and common request behavior
│   └── Persistence/        # Cache envelopes, preferences adapters, file storage
├── Features/
│   ├── Calendar/           # Calendar engine, month/detail/converter UI
│   ├── Dashboard/          # Menu-bar popover composition and glance cards
│   ├── Settings/           # Preferences UI
│   ├── Weather/            # Weather provider, cache, store, detail UI
│   ├── Forex/              # NRB provider, cache, calculator, detail UI
│   └── Tools/              # Local Nepal-specific converters
├── Services/               # Provider protocols and concrete external adapters
└── Resources/              # Bundled calendar/festival data and string catalog

Tests/SajiloAppTests/
├── Core/
├── Features/
└── Services/
```

The current bootstrap is intentionally small. As files grow, move them toward the structure above rather than creating generic catch-all folders.

## Dependency rule

```text
SwiftUI view
    ↓ reads / sends intent to
Feature store (@Observable, @MainActor)
    ↓ uses
Repository or use-case
    ↓ uses
Provider protocol + cache
    ↓
Remote API or bundled local data
```

- Views do not call `URLSession`, parse JSON, or convert BS dates.
- Stores own presentation state and coordinate user actions.
- Repositories decide fresh versus cached data.
- Provider adapters know an API’s transport and decoding details.
- The calendar engine remains pure Swift and has no networking dependency.

## State ownership

- Use `@Observable` and `@MainActor` for UI-facing stores.
- A view that owns an observable store uses `@State private`.
- A child that only displays data receives `let` values.
- A child that edits an injected observable store uses `@Bindable`.
- Keep `@State`, `@FocusState`, and `@AppStorage` private.
- Do not put `@AppStorage` directly in an `@Observable` type unless it is marked `@ObservationIgnored`.

## Data boundaries

### Local calendar

`NepaliDate`, BS↔AD conversion, month lengths, and bundled holiday/event data must work without a network connection. The conversion engine is the most heavily tested part of the product.

### Remote modules

Each external source has a protocol, concrete provider, cache policy, and explicit freshness state:

```swift
enum LoadState<Value: Equatable>: Equatable {
    case loading
    case fresh(Value, updatedAt: Date)
    case stale(Value, updatedAt: Date)
    case unavailable
    case failed(message: String)
}
```

Remote values must never silently disappear. The UI shows either fresh data, clearly labelled cached data, or a compact unavailable/error state.

## Suggested provider pattern

```swift
protocol ForexProviding: Sendable {
    func latestRates() async throws -> ForexSnapshot
}

struct NRBForexProvider: ForexProviding {
    let client: any HTTPClient

    func latestRates() async throws -> ForexSnapshot {
        // Build request, decode official NRB response, return domain model.
    }
}
```

Inject dependencies into stores/repositories. Do not access a global network singleton directly from a view or make live network calls in tests.
