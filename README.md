# Sajilo

Sajilo is a native macOS menu-bar utility for the Nepali calendar and everyday Nepal tools.

This bootstrap implements the product shell:

- macOS 14+ SwiftUI app
- menu-bar-only activation policy
- `MenuBarExtra` dashboard with calendar-first hierarchy
- configurable menu-bar date format
- Settings scene using local preferences
- pure local models and initial Swift Testing coverage
- bundled festival, tithi, and public-holiday data for BS 2066–2083
- live Kathmandu weather through Open-Meteo, with a cached last result and attribution

## Current calendar range

The local BS↔AD converter supports **BS 1992–2090** (approximately AD 1935–2034).

The bundled month-length table was assembled from five independently maintained open-source datasets, then checked month by month against a published Nepali calendar — 1,115 of 1,116 month starts agree. Library agreement alone was not enough: for BS 2084 the majority reading matched the published calendar in only 5 of 12 months, and the minority reading was adopted after it matched all 12.

Month lengths for **BS 2085–2090 are provisional**: Nepal's Panchanga Nirnayak Samiti publishes the official calendar only about a year ahead, so no published calendar was available to check them against. The calendar labels those months in the UI, and `BikramSambatCalendar.provisionalNepaliYears` exposes the window. See [third-party notices](THIRD_PARTY_NOTICES.md) for full provenance and the validation method.

## Open and run

Open `Package.swift` in Xcode 16+ and run the `Sajilo` executable on macOS 14 or later. Or run the local app bundle directly:

```bash
./scripts/run-local-app.sh
```

Debug builds also open a `Sajilo Preview` window and use a normal Dock presence to make visual development easy. Release builds remain menu-bar-only.

Run the test suite with `swift test`. It needs full Xcode selected — Command Line Tools alone cannot resolve the `Testing` module.

## Intentional next steps

1. Add a date-detail scene for a selected date, including the bundled festival
   and tithi context.
2. Add a calendar detail scene for a selected date.
3. Add NRB forex through a protocol-backed provider and cached repository.
4. Add launch-at-login, the Dock icon preference, and localization.
5. Re-verify each provisional BS year against the official calendar as it is published.

See [Nepal-Menubar-PRD.md](Nepal-Menubar-PRD.md) for the complete product requirements.

## Project standards

- [Architecture](docs/ARCHITECTURE.md)
- [Coding standards](docs/CODING-STANDARDS.md)
- [Development guide](docs/DEVELOPMENT.md)
- [Contributing](CONTRIBUTING.md)

## Licence

Sajilo is released under the [MIT License](LICENSE).

Bundled third-party calendar data keeps its own terms; see
[third-party notices](THIRD_PARTY_NOTICES.md) for each dataset, its licence, and
its provenance.
