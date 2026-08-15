# Sajilo coding standards

## Keep code boring and explicit

- Prefer standard Swift and Apple frameworks before adding a library.
- Use clear types and names over clever abstractions.
- Extract a type when it has a real responsibility, not merely to satisfy a layer diagram.
- Use `private` and `private(set)` by default; widen visibility only when needed.
- Keep one primary type per file and name the file after that type.

## Swift and concurrency

- Use `async`/`await`; do not introduce callback APIs for new work.
- Mark UI-facing observable stores `@MainActor`.
- Make cross-concurrency value models `Sendable`.
- Prefer `struct` and immutable `let` properties for domain values.
- Make frequently assigned observable values `Equatable` to avoid unnecessary UI invalidation.
- Never use `Task.detached` unless ownership and cancellation are explicit.
- Do not force unwrap production values. Use `guard`, optional binding, or a typed error.

## SwiftUI

- Use `@Observable` for new state models.
- Use `@State private` for view-owned state; use `@Bindable` only when a child edits an injected observable model.
- Use `Button` for every tappable action, rather than `onTapGesture`.
- Use stable, persistent IDs in `ForEach`; never use array indices as identity for mutable data.
- Keep a view body readable. Extract a named subview when a section gains its own layout or accessibility responsibility.
- Prefer system text styles and `.foregroundStyle()`.
- Add VoiceOver labels/hints when the default label is unclear; hide decorative symbols from accessibility.
- Do not put business logic, date conversion, cache behavior, or remote requests in views.

## Data and error handling

- Model provider responses separately from app/domain models when their shapes differ.
- Decode remote values defensively and validate required fields.
- Preserve the source timestamp with cached data.
- Do not swallow errors. Convert them into an explicit `LoadState` appropriate for the UI.
- Keep source, refresh cadence, and stale-data behavior next to every provider/repository implementation.

## Testing

- Use **Swift Testing** for unit and integration tests; use XCTest only for UI tests.
- Keep tests fast, isolated, repeatable, and independent of test order.
- Use `#expect` for assertions and `#require` for required setup/optional unwrapping.
- Prefer parameterized tests for numeral/date-format cases.
- Inject time, HTTP client, and persistence dependencies into testable types.
- Calendar conversion requires happy-path, boundary, and invalid-input fixtures before UI work is complete.

## Naming

- Types: nouns (`ForexSnapshot`, `CalendarStore`).
- Protocols: capability adjective/verb form (`ForexProviding`, `Caching`).
- Functions: clear verbs (`refreshIfStale()`, `convertToGregorian()`).
- Booleans: read as a question (`isLoading`, `hasHoliday`, `shouldShowDockIcon`).
- Avoid vague names such as `Manager`, `Helper`, `Utils`, `Data`, or `Thing`.

## Pull-request quality bar

Every PR should answer:

1. What user behavior changed?
2. Which data/state boundary owns the change?
3. How does it behave offline, stale, or failed?
4. Which tests prove the non-UI behavior?
5. What manual macOS interaction was checked?
