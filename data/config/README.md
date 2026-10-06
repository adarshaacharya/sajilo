# data/config

Everything Sajilo can be told after it ships. Each file is one **pack**:
compiled into the app as the offline default, and published, signed, to
`https://config.sajilo.fyi/` as the live override. Edit a file, open a PR,
merge it: CI validates, signs and deploys it, and every running copy picks it
up within about an hour. Nothing else changes a remote value.

**How to publish, undo, rotate keys and troubleshoot:
[docs/remote-config.md](../../docs/remote-config.md).**

| Pack | What | Rust type |
|---|---|---|
| `jokes.json` | Break, meal and bedtime jokes, and the cheers after a break | `sajilo_core::config::jokes::JokesPack` |
| `flags.json` | Kill switches: pause a remote module (`news`) or one feed (`bazar.fuel`), with the reason shown | `sajilo_core::config::flags::FlagsPack` |
| `sources.json` | URL prefix rewrites for a source that moved | `sajilo_core::config::sources::SourcesPack` |
| `kalimati.json` | English names for Kalimati's Nepali produce names | `sajilo_core::config::kalimati::KalimatiPack` |
| `calendar.json` | The Sunday-holiday rule; per-day festival and holiday corrections | `sajilo_core::config::calendar::CalendarPack` |
| `calendar-years.json` | Festival data for years after the bundled range (up to two years, same shape as `data/calendar-events/`) | `sajilo_core::config::calendar_years::CalendarYearsPack` |
| `news-sources.json` | Extra newsrooms: any site with an RSS or Atom feed (up to 20) | `sajilo_api::news::NewsSourcesPack` |
| `radio.json` | Stations to add, hide, or give a new `https` stream | `sajilo_api::radio::RadioPack` |
| `directory.json` | Phone numbers, official sites, keeper reminder templates and renewal guides | `sajilo_core::config::directory::DirectoryPack` |
| `announcements.json` | Notices on the Today screen | `sajilo_api::announcement::AnnouncementsPack` |

## Rules

- **Data, never code.** No scripts, selectors or expressions.
- **Bounds hold even when signed.** Text lengths, `https` public URLs only,
  calendar patches only inside the bundled
  years, kill switches only on remote modules. The type's `validate()` is the
  list; CI runs it on every PR (`cargo run -p sajilo-config-publish -- check`).
- **A user's own edits win.** Joke edits are keyed by the line's English
  text; rewording a line drops its edit, as an app update always has.
- **Additive changes keep the schema.** A breaking shape change bumps the
  pack's `SCHEMA` and is published alongside the old one.

Examples:

```jsonc
// flags.json — rashifal's source broke
{ "paused": { "rashifal": { "en": "Rashifal is paused while its source is fixed.",
                            "ne": "स्रोत मर्मत हुँदै गर्दा राशिफल रोकिएको छ।" } } }

// sources.json — a paper moved its feed
{ "rewrites": { "https://old.example.com/feed": "https://new.example.com/rss" } }

// calendar-years.json — next year's almanac, before the release that bundles it
{ "years": { "2084": [ /* 12 months, each exactly like data/calendar-events/2084/<n>.json */ ] } }

// news-sources.json — a new newsroom
{ "sources": [ { "id": "setopati", "name": "Setopati",
                 "feeds": ["https://www.setopati.com/feed"], "english": false } ] }

// radio.json — a missing station, a dead one, a moved stream (https only)
{ "add": [ { "slug": "new-fm", "name": "New FM", "frequency": "100.1",
             "logoUrl": null, "streamUrl": "https://stream.example.com/new" } ],
  "hide": ["dead-fm"],
  "streams": { "kantipur-fm": "https://stream.example.com/kantipur" } }

// kalimati.json — a new item on the board
{ "names": [ …, { "ne": "ब्रोकाउली", "en": "Broccoli" } ] }

// calendar.json — the Sunday holiday ended; a holiday was moved
{ "sunday": { "from": "2026-04-06", "until": "2026-12-31" },
  "events": [{ "year": 2083, "month": 7, "day": 5, "name": "…", "holiday": true }] }
```
