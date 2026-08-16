# Third-party notices

## News headlines

Headlines come from publisher RSS feeds, each verified to return
`application/rss+xml`:

| Publisher | Feed |
|---|---|
| OnlineKhabar | `https://www.onlinekhabar.com/feed` |
| OnlineKhabar English | `https://english.onlinekhabar.com/feed` |
| Annapurna Post | `https://annapurnapost.com/rss/` |
| Ratopati | `https://www.ratopati.com/feed` |
| Bizkhabar | `https://www.bizkhabar.com/feed` |

**Only the headline, link, and publish date are read.** Several of these feeds
carry the full article body in `content:encoded`; the parser touches three
elements and ignores everything else. Syndicating a feed is not a licence to
republish what it contains, and Sajilo is distributed beyond Nepal, so this
holds whichever jurisdiction's rules apply. Every headline opens in the user's
default browser — there is no embedded reader (PRD §11).

Kantipur and Hamro Patro are deliberately absent. Neither publishes a real
feed — both advertised endpoints return HTML — and the alternative, parsing
their pages, is the same technique that costs the bundled festival dataset 349
days of data. Reliability, not permission, is the reason.

Headlines are merged round-robin rather than sorted by time: Annapurna Post
publishes no `pubDate` at all, and OnlineKhabar returns 55 items where
Bizkhabar returns 10, so a time sort would bury the smaller publishers.

All sources are read regardless of the app's language setting. That setting
governs Sajilo's own chrome and says nothing about which newsrooms a reader
wants — someone running the interface in English is usually still a Nepali
reader. Headlines appear in whatever language they were written in; nothing is
translated.

## Hamro Patro rashifal — used with permission

The daily rashifal is written and published by **Hamro Patro**
(`https://www.hamropatro.com/rashifal`) and is shown in Sajilo **with their
permission**.

This is the only source in Sajilo that carries somebody's *writing* rather than
their numbers, and the distinction is the reason this section exists. A fuel
price or a gold rate is a fact: it belongs to nobody, and reproducing it raises
no question. These twelve paragraphs are composed each morning by Hamro Patro's
astrologer, and reproducing them is reproducing an original work. Every other
programmatic "Nepali rashifal API" on the internet is an unattributed scrape of
this same page; Sajilo is not one of them.

What that means in practice:

- The readings are shown **verbatim** — never trimmed, summarised, reflowed, or
  paraphrased.
- Hamro Patro is **credited on the same screen as the words**, with a link back
  to the source page, rather than in a settings pane the reader never opens.
- There is **no offline fallback**. If the arrangement ends, removing the
  provider removes the feature; nothing keeps serving the text.
- The parser takes **all twelve readings or none**. A partial page means the
  markup moved, and showing four signs while silently dropping eight would
  misrepresent the source.

The `/en/rashifal` path serves the same Nepali prose with only the surrounding
chrome translated, so there is no English edition to prefer. The reading stays
in Nepali whatever Sajilo's language is set to — the same decision made for news
headlines, and for the same reason: the language setting governs Sajilo's own
chrome, not what a Nepali reader wants to read.

`RashifalProviding` exists so the source can be replaced without touching the
UI, as with every other provider.

## Nepal Rastra Bank exchange rates

Rates come from Nepal Rastra Bank's published forex API
(`https://www.nrb.org.np/api/forex/v1/rates`) — the country's central bank, and
the official source PRD §5.5 names in preference to an aggregator. No API key
and no user data are involved.

NRB quotes some currencies in blocks rather than per unit: **INR per 100, JPY
per 10, KRW per 100**. Sajilo normalises these and labels them (`INR (per 100)`)
so a quote is never silently per-something-else. Buy and sell are kept distinct
and each conversion direction uses the side the customer actually gets.

Sajilo requests a seven-day window and takes the most recent published day, so a
date on which the bank does not publish falls back to the rates still in force
rather than showing nothing.

## Gold and silver rates

Rates come from the **Federation of Nepal Gold and Silver Dealers' Association
(FENEGOSIDA)**, the body that sets the daily rate Nepali jewellers quote —
PRD §5.6's preferred source rather than an aggregator that re-publishes it.

`fenegosida.org` is a JavaScript application: a plain HTML request returns an
864-byte shell with no rates in it. The numbers are served by a public,
unauthenticated JSON API on a separate host, which is what Sajilo reads:

| Endpoint | Purpose |
|---|---|
| `https://api.fenegosida.org/api/website/v1/Dashboard/today` | Today's rate and the previous one |
| `https://api.fenegosida.org/api/website/v1/Dashboard/WeeklyChartRate?weekmonthyear=7` | Gold per tola over the last week, for the trend line |

No API key, no sign-up, no user data. Two properties of that payload are worth
recording because getting either wrong is silent rather than loud, and both are
pinned by tests:

- The field is named **`todayBaseRatePerGram` but holds the price for the unit
  named in `rateType`** — 305,200 is one *tola* of fine gold, not one gram.
  Reading it as per-gram is wrong by more than an order of magnitude. Sajilo
  derives its per-gram figure by dividing.
- The previous-day field is spelled **`yestarday…`** upstream. The decoder
  matches that spelling rather than correcting it, or the change figure would
  silently decode as zero.

`rateType` is free Nepali text (`छापावाल सुन (१ तोला)`), so the metal and unit
are read out of it by substring rather than by position, and an unrecognised row
is skipped rather than guessed at. `MetalRateProviding` exists so the source can
be replaced without touching the UI.

## Nepal Oil Corporation fuel prices

Retail fuel prices come from **Nepal Oil Corporation**
(`https://noc.org.np/retailprice`) — the state importer that sets every retail
fuel price in the country, so this is the primary source rather than a mirror of
one.

NOC publishes no API, only a server-rendered price history table, which Sajilo
reads directly. Two deliberate choices keep that robust:

- **Columns are located by heading, never by position.** NOC inserting a column
  would otherwise shift diesel's number into the kerosene row — a change that
  produces plausible wrong numbers rather than an error.
- **The effective-date cell has been typed four different ways** over the years
  (`2083.04.17(2026.08.02)`, `2083-03-01 (2026.06.15)`, `2083-02-17(2026.05.31)`,
  `2083.03.16 (2026.06.30)`). The Gregorian date inside the brackets is the part
  that parses unambiguously, so that is what is read, with any of `.`, `-`, or
  `/` accepted as the separator.

Only petrol, diesel, kerosene, and the domestic LPG cylinder are shown. The two
aviation-fuel columns sit beside them in the same table and are ignored. The
most recent revision is the current price and the one below it supplies the
change figure; a single published revision reads as unchanged rather than as a
fall from zero.

## Kalimati produce prices

Daily wholesale rates come from the **Kalimati Fruits and Vegetable Market
Development Board** (`https://kalimatimarket.gov.np/price`), the government body
that runs Nepal's largest wholesale produce market and publishes the rates the
morning papers quote.

Like Nepal Oil Corporation, the board offers no API, only a server-rendered
table, so both read through the same `HTMLTable`. Three properties of the page
shape the parser, and each is pinned by a test:

- **The unit for kilogram is spelled four different ways in a single day's
  table** — `के.जी.`, `के.जी`, `के जी`, `केजी` — because rows are typed by hand.
  Matching on the bare letters rather than the punctuation absorbs all four, and
  any fifth spelling that appears later. Bananas are sold by `दर्जन` and
  pineapple by `प्रति गोटा`.
- **Prices are printed in Devanagari numerals** with a currency prefix and
  thousands separators: `रू १,०००.००`. They are transliterated before anything
  reads them as a number.
- **The table dates itself in Bikram Sambat** in a heading above it rather than
  in any cell — `वि.सं. साउन ३१, २०८३`. Sajilo keeps that as a `NepaliDate` and
  shows it unchanged. The board does not publish on every holiday, so what is on
  screen is sometimes the previous trading day's table, and it should say which
  day rather than implying today.

These are **wholesale** rates, not shop prices, and the UI says so rather than
leaving someone to wonder why the number differs from what they paid.

English names are shown for the items where one is unambiguous, and omitted for
the rest rather than guessed at — a wrong label on a price list makes someone
buy the wrong thing. The lookup matches longest-first because the names nest:
`भेडे खुर्सानी` is capsicum while `खुर्सानी` is chilli. The board's own table
carries the chilli name with and without a stray halant on the same day, so both
spellings are listed verbatim.

## Open-Meteo weather data

The weather card is served by the [Open-Meteo](https://open-meteo.com) forecast
API, and air quality by the same project's
[Air Quality API](https://open-meteo.com/en/docs/air-quality-api). No API key,
no sign-up, and no user location is transmitted — requests carry the fixed
coordinates of the city chosen in Settings.

Air quality is reported on the **US EPA index** rather than Open-Meteo's
European one, because Nepal's Department of Environment and local reporting use
the EPA scale; showing a different number under the same name would be
misleading. The two endpoints are fetched concurrently and air quality is
optional — the forecast still shows when only the air-quality host is
unreachable.

Weather data is licensed **[CC BY 4.0](https://open-meteo.com/en/license)**,
which requires giving appropriate credit, linking the licence, and indicating
whether changes were made. The licence permits doing so "in any reasonable
manner", so Sajilo credits the source in **Settings → Data → Sources** and here,
rather than on the face of the dashboard card.

> **Commercial-use constraint.** The free Open-Meteo API tier is for
> **non-commercial use only**, up to 10,000 calls per day. Sajilo currently
> qualifies: it is free, has no advertising, and no subscription. Adding any of
> those — or exceeding the call ceiling — requires a paid Open-Meteo plan or a
> different provider. `WeatherProviding` exists so the provider can be swapped
> without touching the UI.

## S4NKALP festival, tithi, and holiday data

Sajilo bundles the monthly JSON data files from
[S4NKALP/nepali-calendar-api](https://github.com/S4NKALP/nepali-calendar-api),
commit `a78d0898dac8cf4ee137e7fbaebca42eecc5d7b9`. The
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

### Actual coverage: BS 2066–2083 only

The upstream file tree spans BS 1992–2084, but **festival and tithi data exists
only for BS 2066–2083** (18 years, roughly AD 2009–2027). The other years were
structurally valid JSON with empty festival and tithi fields on every day, plus
Saturday flags that Sajilo already derives. They were intentionally excluded
from the bundled app data: 3.8 MB (74%) of the original 5.1 MB tree.

`CalendarEventStore.supportedYears` is therefore `2066...2083`. Claiming the
wider range would make the UI report "no festival recorded" for dates that were
simply never scraped, which is a different statement from "nothing happens that
day". A test asserts every declared year really has data.

Within the retained range: 216 months, 6,512 days, 2,024 of them (31%) carrying
a named festival.

### Known gap: truncated months

Each source file is a fixed 35-cell (5 × 7) grid. When a month needs six rows —
its leading blanks plus its length exceed 35 — the **trailing days are missing
from the source file**: one day usually, two when the month also starts late in
the week.

Across BS 2066–2083 this affects **44 of 216 months (20.4%)**, totalling **62
days**. Recent years:

| Year | Days lost | Where |
|---|---|---|
| BS 2081 | 7 | बैशाख 30–31, असार 30–31, भदौ 30–31, मंसिर 30, चैत 31 |
| BS 2082 | 1 | कार्तिक 30 |
| BS 2083 | 3 | जेठ 31, साउन 31, फागुन 30 |

Those days carry no festival, tithi, or holiday data. The gap is always a
trailing run, never a hole mid-month, and **cannot** be backfilled from the
following month's leading cell: that cell is unreliable — for BS 2083 Shrawan it
reports the preceding month as 31 days where the verified table says 32.
`CalendarEventStoreTests` pins the coverage, the trailing-only shape, and the
leading-cell exclusion so none of it can silently regress.

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
days in range.

The table was additionally checked against every month of the bundled S4NKALP
scrape — **1,115 of 1,116 month starts agree**. The single exception is BS
2055-11, where the scrape places the month one day later and then re-converges
by BS 2055-12. All five source libraries agree with the shipped reading, so the
scrape is treated as the outlier there. This is the opposite call to BS 2084,
and deliberately so: for a past year the libraries have had decades to be
corrected, whereas for a future year they are extrapolating and the published
calendar is the only real evidence. These are enforced in
`Tests/SajiloAppTests/BikramSambatCalendarTests.swift`.

### Provisional years

Nepal's Panchanga Nirnayak Samiti publishes the official calendar roughly a year
ahead, and no published calendar was available past BS 2084 at the time of
writing. **BS 2085–2090 are therefore unverified**, exposed as
`BikramSambatCalendar.provisionalNepaliYears`, and labelled as such in the UI.
Re-verify each against the official calendar as it is published, and extend the
supported range only with the same month-by-month check — not on library
agreement alone.
