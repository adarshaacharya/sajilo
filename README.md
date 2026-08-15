# Sajilo

Sajilo is a native macOS menu-bar utility for the Nepali calendar and everyday Nepal tools.

This bootstrap implements the product shell:

- macOS 14+ SwiftUI app
- menu-bar-only activation policy
- `MenuBarExtra` dashboard with calendar-first hierarchy
- configurable menu-bar date format
- Settings scene using local preferences
- pure local models and initial Swift Testing coverage

## Current calendar range

The local BS↔AD converter supports **BS 1992–2099** (approximately AD 1935–2043).

The bundled month-length table was assembled by majority agreement across five independently maintained open-source calendar datasets, then validated against four anchor dates — including one the table was not fitted to — plus exhaustive round-trip and contiguity checks over all 39,448 days in range.

Month lengths from **BS 2084 onward are provisional**: Nepal's Panchanga Nirnayak Samiti publishes the official calendar only about a year ahead, and the source datasets genuinely disagree beyond that point. The calendar labels those months in the UI, and `BikramSambatCalendar.provisionalNepaliYears` exposes the window. See [third-party notices](THIRD_PARTY_NOTICES.md) for full provenance and the validation method.

## Open and run

Open `Package.swift` in Xcode 16+ and run the `Sajilo` executable on macOS 14 or later. Or run the local app bundle directly:

```bash
./scripts/run-local-app.sh
```

Debug builds also open a `Sajilo Preview` window and use a normal Dock presence to make visual development easy. Release builds remain menu-bar-only.

The current workspace has only Command Line Tools selected, not full Xcode, so a local macOS app build has not been run here yet.

## Intentional next steps

1. Add a versioned festival/public-holiday dataset; only Saturdays are marked today.
2. Add a calendar detail scene for a selected date.
3. Add weather and NRB forex through protocol-backed providers and cached repositories.
4. Add launch-at-login, the Dock icon preference, and localization.
5. Re-verify each provisional BS year against the official calendar as it is published.

See [Nepal-Menubar-PRD.md](Nepal-Menubar-PRD.md) for the complete product requirements.

## Project standards

- [Architecture](docs/ARCHITECTURE.md)
- [Coding standards](docs/CODING-STANDARDS.md)
- [Development guide](docs/DEVELOPMENT.md)
- [Contributing](CONTRIBUTING.md)
