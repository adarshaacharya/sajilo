# Third-party notices

## S4NKALP festival, tithi, and holiday data

Sajilo bundles the monthly JSON data files from
[S4NKALP/nepali-calendar-api](https://github.com/S4NKALP/nepali-calendar-api),
commit `a78d0898dac8cf4ee137e7fbaebca42eecc5d7b9`, for BS 1992–2084. The
repository is licensed under the MIT License, reproduced below as required:

> MIT License
>
> Copyright (c) 2026 Sankalp Tharu
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

The source files are calendar-grid scrapes. Sajilo ignores leading cells from
the preceding month and never fabricates event data for a missing source day.

### Known gap: truncated months

Each source file is a fixed 35-cell (5 × 7) grid. When a month needs six rows —
its leading blanks plus its length exceed 35 — the **trailing days are missing
from the source file**: one day usually, two when the month also starts late in
the week.

This affects **229 of the 1,116 bundled months (20.5%)**, totalling **349 of
33,978 days (1.0%)**. Recent years:

| Year | Days lost | Where |
|---|---|---|
| BS 2082 | 1 | कार्तिक 30 |
| BS 2083 | 3 | जेठ 31, साउन 31, फागुन 30 |
| BS 2084 | 4 | जेठ 30–31, साउन 30–31 |

Those days carry no festival, tithi, or holiday data. Roughly half of all days
are named in this dataset, so some of them are genuinely losing a festival.

The gap is always a trailing run, never a hole mid-month. It **cannot** be
backfilled from the following month's leading cell: that cell is unreliable —
for BS 2083 Shrawan it reports the preceding month as 31 days where the verified
table says 32. `CalendarEventStoreTests` pins the current coverage, the
trailing-only shape, and the leading-cell exclusion so none of it can silently
regress.

## Bikram Sambat month-length data

The bundled BS 1992–2090 month-length table in
`Sources/SajiloApp/Core/Calendar/BikramSambatCalendar.swift` was assembled from
five independently maintained open-source calendar tables:

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

A year was first included only where at least three of the five sources agreed
and the agreeing sources outnumbered the dissenting ones.

**Agreement between libraries turned out not to be sufficient.** The candidate
table was therefore checked month by month against a published Nepali calendar,
via the scraped dataset in
[S4NKALP/nepali-calendar-api](https://github.com/S4NKALP/nepali-calendar-api)
(MIT), which mirrors `nepalicalendar.rat32.com`. Comparing the Gregorian date
of the first day of every month across a spread of sampled years:

- **BS 1992–2083 — 204 of 204 month starts matched.**
- **BS 2084 — the majority-vote row matched only 5 of 12.** The minority row
  (medic/bsdate) matched all 12 and was adopted instead.

Because BS 2085–2090 rest on that same corrected minority reading, they follow
it too. BS 2091–2099 were **dropped entirely**: they were available only from
the source family that the 2084 check proved wrong, with nothing to verify them
against.

The final table passes five anchors:

| Anchor | Source |
|---|---|
| BS 2000-01-01 = AD 1943-04-14 | published reference the table was *not* fitted to |
| BS 2080-01-01 = AD 2023-04-14 | project epoch |
| BS 2082-01-01 = AD 2025-04-14 | existing fixture |
| BS 2083-04-30 = AD 2026-08-15, a Saturday | existing fixture / PRD example |
| BS 2084-01-01 = AD 2027-04-14 | published calendar |

plus the structural invariants that every year totals 365 or 366 days and every
month runs 29–32 days, and an exhaustive BS→AD→BS round trip over all 36,161
days in range. These are enforced in
`Tests/SajiloAppTests/BikramSambatCalendarTests.swift`.

### Provisional years

Nepal's Panchanga Nirnayak Samiti publishes the official calendar roughly a year
ahead, and no published calendar was available past BS 2084 at the time of
writing. **BS 2085–2090 are therefore unverified**, exposed as
`BikramSambatCalendar.provisionalNepaliYears`, and labelled as such in the UI.
Re-verify each against the official calendar as it is published, and extend the
supported range only with the same month-by-month check — not on library
agreement alone.
