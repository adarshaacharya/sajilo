# Remote config — plan

Status: built on `feat/remote-config`, shipping in one release. "As built"
below records where the build differs from the original plan.

## Why

Everything Sajilo says and everywhere it fetches from is compiled in: 134 joke
pairs in `crates/sajilo-core/src/focus/jokes.rs`, feed URLs in
`crates/sajilo-api/src/news.rs`, provider endpoints as `const`s across
`sajilo-providers`, cache TTLs in `commands/*.rs`, the Sunday-holiday end date
in `calendar/weekly_holiday.rs`. Fixing a joke, a moved RSS feed, or a
government holiday change means cutting a release and waiting for people to
update. There is no kill switch: when a scraper breaks, it stays broken until
the next version lands.

The goal: change *data* without a release, for $0 a month, without making the
app slower, less private, or less reliable offline.

## Principles

1. **Data, never code.** Remote config can change what the app *says* and
   *where it fetches from*. It can never change how the app *computes*. No
   scripts, no expressions, no selectors-as-logic.
2. **Bundled first.** Every pack ships inside the binary. A fresh install with
   no network behaves exactly like today. Remote is an override, never a
   dependency.
3. **Signed, not secret.** The config is public (the repo is public). What
   matters is that nobody but us can change it. Every published manifest is
   signed; the app holds only the public key.
4. **Git is the only way in.** A value changes when a PR merges to `main`. CI
   validates, signs, and publishes. Nobody edits a server by hand.
5. **Static, not an API.** Published config is plain files on a CDN, so there
   is nothing to "protect" from other people calling it: copying it gets them a
   list of jokes, and serving them costs us nothing.
6. **Same validator everywhere.** The Rust code that checks a pack in CI is the
   code that checks it on the device.

## What goes where

| Remote (`data/config/`) | Stays in code |
|---|---|
| Break, meal, bedtime jokes and cheers | Calendar engine, BS month table, almanac maths |
| Plain reminder and notification copy | Parser logic and CSS selectors |
| News feed URLs, provider endpoints and their order | UI strings (`en.json`, `ne.json`) and layout |
| Per-module and per-source kill switches | Telemetry event allowlist — config must never widen collection |
| Cache TTLs (within compiled bounds) | Updater key, config public keys, CSP |
| Weekly holiday rule, calendar event patches | Anything that runs |
| Emergency contacts, government sites, keeper templates | |
| Kalimati name map, crypto id map | |
| Minimum supported version, announcements (later) | |

## How people do it

- **Firebase Remote Config** sets the shape everyone copies: in-app defaults so
  the app "always behaves as expected", fetch in the background, activate
  without visibly changing a screen the user is looking at, and don't stampede
  the server.
- **Signed manifests** (TUF's idea, minus its four key roles): one small signed
  document lists every file by hash. Clients verify the signature once, then
  check each file against its hash. A monotonic sequence number stops a
  replayed old manifest from rolling clients back.
- **minisign / Ed25519** is the de-facto small-project choice; Tauri's updater
  already verifies minisign signatures with the zero-dependency
  `minisign-verify` crate, which is in our `Cargo.lock` today.

Full TUF (separate root, timestamp, snapshot keys) is built for package
repositories with many publishers. We have one publisher and data-only payloads,
so we take its two ideas that matter — signed hashes and rollback protection —
and skip the ceremony.

## Architecture

```
 data/config/*.json  ──PR──▶ main ──CI──▶  validate ─▶ build ─▶ sign ─▶ deploy
   (source of truth)                         (Rust)    (hash)   (minisign)  (static assets)
          │                                                                  │
          │ include_str! at build                     https://config.sajilo.fyi/v1/...
          ▼                                                                  │
   bundled defaults ◀── fallback ── desktop: fetch ─▶ verify ─▶ validate ─▶ store last-good ─▶ activate
```

### Published layout

```
/v1/manifest.json                     signed envelope, short cache, ETag
/v1/packs/jokes.3f9a1c2e7b40.json      content-addressed, immutable
/v1/packs/flags.91d0e4aa02c1.json
/_headers                             cache rules
```

The manifest (inside the signed envelope):

```json
{
  "format": 1,
  "rev": 1759651200,
  "packs": {
    "jokes": { "schema": 1, "sha256": "3f9a1c2e7b40…", "size": 18342,
               "minApp": "0.1.36", "maxApp": null }
  }
}
```

- **`rev`** is the merge commit's timestamp, set by CI. It only goes up, no one
  bumps it by hand, and re-running an old deploy produces a lower `rev` that
  clients refuse.
- **Envelope** is `{ "payload": "<base64 manifest bytes>", "signature":
  "<minisign>" }`. Signing raw bytes avoids JSON canonicalisation bugs.
- **Packs are content-addressed**: the hash is in the name, so they are cached
  for a year and never change. A client downloads a pack only when the manifest
  names a hash it doesn't have.
- **Schema per pack.** Additive changes (a new optional field) keep the schema
  number; unknown fields are ignored. A breaking change publishes a new schema
  alongside the old one until no supported app needs the old.

### Hosting and cost

| Piece | Where | Cost |
|---|---|---|
| Config files | A static-assets-only Cloudflare Worker (`apps/config`), no script | $0: static asset requests are free and unlimited, and don't count toward the 100k/day Worker request limit |
| Domain | `config.sajilo.fyi` custom domain (falls back to `workers.dev`) | $0 |
| Publishing | GitHub Actions on a public repo | $0 |
| KV | Not used. KV free tier is 100k reads/day; at a few thousand daily users polling, that runs out. | — |

A static-assets-only Worker never runs code, so there is nothing to rate-limit
and no bill to run up: no `run_worker_first`, no script, no KV. Workers sends an
`ETag` for every asset and honours `If-None-Match`, so a client that already has
the current manifest gets a ~200-byte `304`. `_headers` sets:

```
/v1/manifest.json
  Cache-Control: public, max-age=300
/v1/packs/*
  Cache-Control: public, max-age=31536000, immutable
```

**Side finding, same cost problem:** the announcements Worker runs code and
reads KV on every request, and every app polls it each hourly background cycle.
That burns the 100k/day free Worker requests at roughly 2–4k daily users, after
which users get `429`s. Phase 7 moves announcements onto this static pipeline.

## Security

### Keys

- One minisign key pair, `sajilo-config`, separate from the updater key. A leak
  of one doesn't compromise the other.
- **Private key**: password-protected, stored as GitHub Actions secrets
  (`CONFIG_SIGNING_KEY`, `CONFIG_SIGNING_KEY_PASSWORD`) inside a GitHub
  Environment `config-publish` whose deployment rule is "`main` only". A PR from
  a fork can't read it; a branch other than `main` can't publish.
- **Public keys**: compiled into `crates/sajilo-config`. The app carries the
  current key *and* the next key, so rotation is: publish an app with the new
  next-key, start signing with it once most users have updated, retire the old.
- Cloudflare API token for the deploy: scoped to "Workers Scripts: Edit" on the
  one account, in the same Environment.

### Threats

| Threat | Defence |
|---|---|
| Someone edits files on the CDN, or takes over the Cloudflare account or domain | Signature check fails → keep last-good |
| Replay of an old, validly signed manifest | `rev` must be ≥ the stored `rev` |
| A pack swapped for another validly signed pack | Its SHA-256 must match the manifest |
| Huge response to exhaust memory | Hard caps before parsing: manifest 16 KB, each pack 256 KB |
| Signing key stolen | Blast radius is bounded by on-device validation below; rotate via the next-key |
| Bad but correctly signed data (our mistake) | Same Rust validator runs in CI and on device; anything out of bounds → pack rejected, last-good kept |
| Old app meets a new schema | Pack skipped by `schema`/`minApp`; last-good or bundled stays |
| Tracking users through config fetches | Requests carry only the existing `User-Agent` (version). No install id, no query string, no cookies |

### On-device bounds (enforced even on a correctly signed pack)

- Strings: length caps per field (jokes keep `MAX_LINE = 90`), no control
  characters. Rendered as text only — React escapes, notifications are plain.
- URLs: `https` only; no IP literals, no `localhost`, no private ranges.
- TTLs: clamped to compiled min/max per module.
- Kill switches can pause a remote module (it shows the existing
  `Unavailable` state with a "paused" reason). They can never turn off
  anything offline: calendar, converter, tools, notes, day plans.
- Calendar patches: only dates inside the bundled range, valid BS dates, and a
  maximum patch count.
- Nothing remote can change the telemetry allowlist, the updater, or keys.

## Performance

- **Startup cost: none.** The bundled pack is parsed lazily (`OnceLock`) on
  first use. The last-good remote copy is read from SQLite in the same lazy
  step. No network on the startup path.
- **When it fetches:** in the existing `background_refresh` cycle (15 s after
  launch, then hourly), at most every 3 hours, with ±20 % jitter so a release
  doesn't make every client hit the CDN in the same minute. A normal check is
  one conditional GET that returns `304`.
- **What it downloads:** only packs whose hash changed. A typical edit is one
  ~20 KB file.
- **When it applies:** immediately in memory, behind an `Arc` swap. Jokes take
  effect at the next reminder; sources at the next fetch. No screen rerenders
  just because config changed (Firebase's "don't change a screen the user is
  looking at").
- **Reads:** in-memory, no locking on the hot path, no per-reminder parsing.

## Folder layout

```
data/config/                    Source of truth, edited by PR
  jokes.json
  flags.json
  sources.json
  calendar.json
  directory.json
  README.md                     What each pack is, its bounds, how to publish

crates/sajilo-config/           Pure Rust, no I/O (like sajilo-core)
  src/envelope.rs               Envelope + manifest types, signature verify
  src/packs/                    One module per pack: type, bundled(), validate()
  src/store.rs                  Layering: bundled < last-good < user edits; rev rules
  src/keys.rs                   Current + next public key
  tests/                        Reads only fixtures/config/

apps/config/                    Static-assets-only Worker
  wrangler.jsonc
  public/_headers               Committed
  dist/                         Built by CI, gitignored

apps/config-publish/            Rust bin: check | build | sign
                                (reuses sajilo-config validators)

apps/desktop/src-tauri/src/
  remote_config.rs              Fetch, verify, store last-good, swap

fixtures/config/                Signed sample manifests: valid, tampered,
                                rolled-back, oversized, wrong schema

.github/workflows/
  ci.yml                        + `config-publish check` on every PR
  publish-config.yml            On push to main touching data/config/**
```

Why a new crate rather than `sajilo-core`: signature verification and manifest
handling aren't calendar logic. `sajilo-core` keeps owning the *types* the
engine needs (e.g. `Joke`) and gains a parameter where it used to read a
`const`; `sajilo-config` owns parsing, validation and trust. The CI rule that
keeps `tokio`/`reqwest`/Tauri out of `sajilo-core` extends to `sajilo-config`.

## Not breaking anything

- **Phase 1 changes no behaviour.** Jokes move from Rust consts to
  `data/config/jokes.json`, still compiled in, no network. A parity test
  asserts the JSON matches the old consts line for line before the consts are
  deleted.
- **Stable joke ids.** Today a user's joke edits (`DeckEdits`) are keyed by the
  built-in line's English text. Once remote edits can change that text, the
  key would break. Each joke gets an `id` (`eyes.07`); settings move from
  `focus.settings.v1` to `v2`, mapping old English keys to ids using the
  bundled pack. Old keys that don't match are kept, not dropped.
- **`normalise` never deletes because of remote.** Today it drops edits for
  lines the build no longer has. With remote packs, that would delete a user's
  edits if a pack briefly lacked a line. Unknown-id edits are ignored at deal
  time and kept on disk.
- **Every failure ends at last-good, then bundled.** Network error, bad
  signature, bad hash, too big, wrong schema, invalid content — all log once
  and keep what the app already had. The settings "System" tab shows
  `Config rev 1759651200 · checked 2 h ago` (or the failure) for debugging.
- **Callers updated in the same PR:** `apps/promo/promo-data.mjs` reads
  `jokes.rs` as text today and switches to the JSON; core tests in
  `crates/sajilo-core/tests/focus.rs` switch from the consts to the bundled
  pack.
- **Checks on every phase:** `cargo test --workspace`, clippy, fmt, desktop
  typecheck/lint/build, and a manual run of `bun run tauri dev` with the network
  off, with a tampered manifest, and with a rolled-back manifest.

## Steps

Each phase is its own PR, merged and released before the next.

0. **Foundations.** This plan; `crates/sajilo-config` skeleton with envelope,
   verify and rev rules plus fixture tests; key generation script; `apps/config`
   static Worker with `_headers`; `config-publish check` in `ci.yml`. No app
   change.
1. **Jokes as bundled data.** `data/config/jokes.json` with ids; core reads the
   pack; edits migration to `v2`; parity test; promo updated. No network.
2. **The remote channel.** `config-publish build|sign`; `publish-config.yml`
   with the `config-publish` Environment; `HttpClient` gains a conditional GET
   that returns status and `ETag`; `remote_config.rs` in the desktop; System tab
   line. Jokes become remotely editable.
3. **Flags.** Module and source kill switches surfacing as `Unavailable`
   ("paused"), `minApp` for the whole app.
4. **Sources.** Feed URLs, provider endpoints and order, TTLs within bounds.
5. **Calendar.** `SUNDAY_UNTIL` and event patches layered over the bundled
   events, with the strictest validation.
6. **Directory.** Contacts, government sites, keeper templates: move out of
   TypeScript into a pack, served to the UI through a command.
7. **Announcements on the static pipeline.** Notices become a pack; the KV
   Worker keeps serving old versions until they fall below `minApp`.

## Not doing

- A dynamic API, accounts, or per-user config.
- Remote code, scripts, or remotely defined parsers.
- A/B testing or percentage rollouts (a `rollout` field can be added to a pack
  later if a canary is ever needed).
- Making the API "app-only": impossible for an open-source client, and
  unnecessary once the files are static, signed, and free to serve.

## As built

Everything in the steps above shipped together, with these differences:

- **Pack types live in `sajilo-core/src/config/`**, not in `sajilo-config`:
  the engine needs them (`jokes::lines`, `weekly_holiday`, `events`). Each is
  a `Pack` with a bundled copy, a `validate()`, and a process-wide slot the
  desktop installs into. `sajilo-config` keeps trust: envelope, signature,
  hashes, rev, version ranges, and the registry. The announcements pack is
  in `sajilo-api`, next to the `Announcement` type it carries.
- **Sources are rewrites, not a URL list.** `sources.json` maps an old URL
  prefix to a new one and the shared `HttpClient` applies it to every
  request, so no call site changed and `format!`-built URLs (NRB, Open-Meteo)
  are covered too. Defaults stay next to their parsers. Config fetches
  themselves are never rewritten, so a bad rewrite can't cut a client off
  from the fix.
- **No TTL override.** Refresh intervals stay in code; remote control of
  them wasn't worth the misconfiguration risk.
- **Kalimati names are a pack** (`kalimati.json`), matched longest-first
  whatever order the file lists them in.
- **Kill switches act in `Feed`,** by cache key: `bazar.metals.v1`
  is feed `bazar.metals` in module `bazar`. A paused feed isn't fetched and
  keeps its last value (labelled by age), or shows the pause reason.
- **No joke ids.** User edits stay keyed by English text — the same rule an
  app update has always followed. `normalise` treats a line as known if
  either the bundled or the installed pack has it, so a pack can't delete an
  edit.
- **Announcements moved to the pack.** This build never calls the
  announcements Worker; it stays up for older versions. That removes the
  hourly per-user Worker request that would have hit the free limit.
- **`minApp` for the whole app** is an announcement with `maxVersion`, not a
  flag.
- **Content-addressed paths** are `packs/<name>.<schema>.<sha12>.json`.
- **Not moved yet:** plain reminder and notification copy (`focus.rs`,
  `notify.rs` — mostly `format!` templates with numbers in them) and the
  Kalimati and crypto name maps. They're in the "remote" column above but
  still compiled in; each is a new pack following the jokes pattern.
  (The Kalimati map has since moved; the crypto map is a one-off migration
  and stays in code.)
- **The System tab** has an "App content" row: last check, how many packs
  came from remote, and "Check now".

### Verified

- `cargo test --workspace`, clippy (`-D warnings`, including the desktop),
  fmt, desktop typecheck/lint/build, showcase record/build, landing
  check/build.
- Trust tests (`crates/sajilo-config/tests/trust.rs`): good signature opens;
  the fixture key is not trusted by real builds; tampered payload, garbage,
  oversized, unsafe path, future format, rollback and wrong hash are refused;
  version-range selection.
- Desktop sync tests (`remote_config.rs`): publish installs, repeat is a 304
  with no downloads, restart restores before network, unknown key changes
  nothing, older rev refused, swapped pack and out-of-bounds pack keep the
  installed copy, offline is an error not a change.
- End to end on a real debug build against `wrangler dev` serving a build
  signed with the production key: it fetched the manifest and all six packs.
  The Today screen showed the remote notice and a patched public holiday.
  Rashifal (paused) wasn't refetched while news and forex were. Wrangler
  served the `_headers` cache rules, an ETag, and `304` on `If-None-Match`.

### Before the first publish

1. Create a GitHub Environment `config-publish`, deployment branches: `main`
   only. Add secrets:
   - `CONFIG_SIGNING_KEY`: the contents of the current secret key file
   - `CONFIG_SIGNING_KEY_PASSWORD`
   - `CLOUDFLARE_API_TOKEN`: "Edit Cloudflare Workers" template, this account
   - `CLOUDFLARE_ACCOUNT_ID`
2. Keep the *next* key pair offline (password manager), not in GitHub.
3. Merge. `publish-config.yml` deploys `sajilo-config` with the
   `config.sajilo.fyi` custom domain on the existing zone.

## Sources

- Cloudflare Workers pricing — free limits, static assets free and unlimited:
  https://developers.cloudflare.com/workers/platform/pricing/
- Static assets billing, `run_worker_first` counts as a request:
  https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- Static assets headers, ETag, `_headers`:
  https://developers.cloudflare.com/workers/static-assets/headers/
- Static assets limits (20,000 files, 25 MiB each on free):
  https://developers.cloudflare.com/workers/platform/limits/
- Firebase Remote Config loading strategies:
  https://firebase.google.com/docs/remote-config/loading
- `minisign-verify`: https://docs.rs/minisign-verify/latest/minisign_verify/
- Minimal TUF-style signed manifests (DSSE + Ed25519, no online timestamp key):
  https://github.com/JINA-CODE-SYSTEMS/tally-mcp-server/pull/214
