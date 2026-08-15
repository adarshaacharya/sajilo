# Contributing to Sajilo

## Development baseline

- macOS 14+
- Swift 6.2+
- SwiftUI and Observation
- No third-party runtime dependencies without a written reason
- Full Xcode is required to run the app and its Swift Testing suite

## Before opening a pull request

1. Keep the change scoped to one feature or concern.
2. Follow [Coding Standards](docs/CODING-STANDARDS.md).
3. Add or update tests for pure business logic and service behavior.
4. Run `swift test` from a full Xcode environment.
5. Verify the menu-bar interaction manually when changing SwiftUI UI.
6. Explain user-visible changes and data-source changes in the pull request.

## Commit guidance

Use short imperative commits:

```text
Add BS date formatting
Cache NRB forex response
Fix calendar month boundary
```

Avoid mixing formatting-only cleanup with behavior changes.

## Data-source changes

Any new remote provider must document its source, permitted use, refresh interval, cache policy, stale-data behavior, and failure state. Do not place scraping/parsing logic in a SwiftUI view.
