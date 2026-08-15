# Third-party notices

## Bikram Sambat month-length data

The bundled BS 1992–2099 month-length table in
`Sources/SajiloApp/Core/Calendar/BikramSambatCalendar.swift` was assembled by
majority agreement across five independently maintained open-source calendar
tables:

| Project | Language | Range | Licence |
|---|---|---|---|
| [medic/bikram-sambat](https://github.com/medic/bikram-sambat) | JS / Java | 1970–2090 | AGPL-3.0 |
| [shivathapaa/Nepali-Date-Picker](https://github.com/shivathapaa/Nepali-Date-Picker) | Kotlin | 1969–2100 | MPL-2.0 |
| [opensource-nepal/node-nepali-datetime](https://github.com/opensource-nepal/node-nepali-datetime) | TypeScript | 2000–2099 | GPL-3.0 |
| [opensource-nepal/py-nepali](https://github.com/opensource-nepal/py-nepali) | Python | 2000–2099 | GPL-3.0 |
| [skhatri/bsdate](https://github.com/skhatri/bsdate) | JS / Groovy | 1970–2090 | Apache-2.0 |

Only the month lengths — factual calendar data, not the surrounding
implementations — were used. Sajilo's conversion logic is its own.

### How the table was validated

A year was included only where at least three of the five sources agreed and
the agreeing sources outnumbered the dissenting ones. BS 1992–2099 is the
longest contiguous run meeting that bar; years before 1992 have scattered
unresolved conflicts and are deliberately excluded.

The assembled table was then checked against four anchors:

- BS 2000-01-01 = AD 1943-04-14 — a published reference the table was *not*
  fitted to, making it an independent check
- BS 2080-01-01 = AD 2023-04-14
- BS 2082-01-01 = AD 2025-04-14
- BS 2083-04-30 = AD 2026-08-15, a Saturday

All four pass, along with the structural invariants that every year totals 365
or 366 days and every month runs 29–32 days. These are enforced as tests in
`Tests/SajiloAppTests/BikramSambatCalendarTests.swift`.

### Provisional years

Nepal's Panchanga Nirnayak Samiti publishes the official calendar roughly a
year ahead. Month lengths from **BS 2084 onward are therefore extrapolations**,
and the source libraries genuinely disagree about them — in some years even on
whether the year has 365 or 366 days. Those years are exposed as
`BikramSambatCalendar.provisionalNepaliYears` and must be re-verified against
the official calendar as each year is published.
