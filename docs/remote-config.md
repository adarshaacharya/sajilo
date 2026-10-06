# Remote config — how to

The runbook for changing what Sajilo says without shipping a release. For
*why* it works this way, see [remote-config-plan.md](remote-config-plan.md);
for the shape and limits of each file, [data/config/README.md](../data/config/README.md).

## In one paragraph

Each file in `data/config/` is a **pack**. It is compiled into the app as the
offline default, and published, signed, to `https://config.sajilo.fyi/` as
the live override. You change a value by merging a PR to `main`; the
**Publish config** workflow validates, signs and deploys it. Running apps
check about every hour, verify the signature and every pack's hash, and
apply what changed. Anything wrong (bad signature, bad hash, out-of-bounds
content, offline) keeps what the app already has. Hosting is a
static-assets-only Cloudflare Worker: free and unmetered.

| Pack | Change it when |
|---|---|
| `announcements.json` | You want a notice on the Today screen (urgent = also a system notification) |
| `calendar.json` | The government adds, moves or cancels a holiday; the Sunday-holiday rule changes |
| `calendar-years.json` | Next year's almanac is out |
| `directory.json` | A phone number, government site, keeper template or renewal guide is wrong |
| `flags.json` | A remote source broke and should be paused |
| `jokes.json` | You want new or different jokes |
| `kalimati.json` | Kalimati lists an item with no English name |
| `news-sources.json` | You want to add a newsroom with an RSS feed |
| `radio.json` | A station is missing, dead, or its stream moved |
| `sources.json` | A source moved to a new URL |

---

## Publish a change

1. Edit the file in `data/config/`.
2. Check it locally, which runs the same validation the app runs:
   ```bash
   cargo run -p sajilo-config-publish -- check
   ```
   On success it prints `10 packs valid`. Otherwise the error names the file
   and the first problem, e.g. `data/config/jokes.json: jokes: decks.eyes has
   fewer than 3 lines`.
3. Open a PR. CI runs the same check ("Remote config is valid").
4. Merge. **Publish config** starts on `main` and **waits for your approval**:
   the `config-publish` environment has you as a required reviewer, so an
   accidental push never goes live on its own. Open the run on GitHub (Actions
   › Publish config, or the email/notification GitHub sends) and press
   **Review deployments › Approve and deploy**. It deploys in a few minutes.
   Reject it, or just leave it, and nothing is published.

### How long until users see it

| Step | Time |
|---|---|
| You approve the deployment on GitHub | when you choose |
| Workflow builds, signs, deploys | ~3–5 min |
| Cloudflare may serve the old manifest | up to 5 min |
| Each app's next check | up to ~1¼ h (1 h ± 20%), 15 s after launch, or at once with **Check now** |

To see it yourself straight away: Settings → System → **App content** →
**Check now**. The row then says "Checked just now" and how many packs came
from remote.

### Confirm it's live

```bash
curl -s https://config.sajilo.fyi/v1/manifest.json \
  | python3 -c 'import json,sys,base64; print(base64.b64decode(json.load(sys.stdin)["payload"]).decode())'
```

That prints the manifest: `rev` (the merge commit's Unix time) and each
pack's `sha256` and `path`. A newer `rev` than before means the publish
landed. To see one pack's content, fetch its path:

```bash
curl -s https://config.sajilo.fyi/v1/packs/<path from the manifest>
```

## Undo a change

Revert the PR and merge the revert. The revert is a newer commit, so it gets
a newer `rev` and every app takes it.

Don't re-run an *older* Publish config run to roll back. Its `rev` is lower
than what apps already have, and they refuse it as a rollback by design.

A change that fails validation never ships: CI stops the PR, and an app
would refuse it anyway.

---

## Common jobs

### A holiday is announced today

`calendar.json`, one entry per day:

```json
{ "year": 2083, "month": 7, "day": 5, "name": "Public holiday (Cabinet decision)", "holiday": true }
```

- A field left out keeps the bundled value. `"name": ""` clears a name;
  `"holiday": false` cancels a holiday.
- Only years inside the bundled range (2066–2083); later years go in
  `calendar-years.json`.
- To also tell people, add an `urgent` notice to `announcements.json` (next
  section).

### The Sunday holiday ends (or changes)

`calendar.json`:

```json
"sunday": { "from": "2026-04-06", "until": "2026-12-31" }
```

`until` is the last Sunday that was a holiday; every Sunday before it keeps
showing as one. `"sunday": null` means Sunday was never a holiday.

### Send a notice

The quick way, from `apps/announcements`:

```bash
bun run announce            # asks for each field, validates, commits, pushes
bun run announce --dry-run  # writes the file only
bun run announce --prune    # drops expired announcements
```

Then approve the Publish config run on GitHub. By hand, it is an entry in
`announcements.json`:

```json
{
  "id": "holiday-2083-07-05",
  "category": "notice",
  "level": "important",
  "title": { "en": "Public holiday tomorrow", "ne": "भोलि सार्वजनिक बिदा" },
  "body":  { "en": "The government has declared Kartik 5 a public holiday.",
             "ne": "सरकारले कात्तिक ५ गते सार्वजनिक बिदा घोषणा गरेको छ।" },
  "expiresAt": "2026-10-23T00:00:00Z"
}
```

**Category** — what it is, and the From Sajilo switch it follows:

| `category` | For | Pops up by default | Users' switch |
|---|---|---|---|
| `notice` | Holiday declared, bandh, alert | yes | on |
| `greeting` | Dashain, New Year, on the day | yes | on |
| `update` | A new version, "please update" | no | on |
| `status` | A source late or down (set `screen`) | no | none |
| `tip` | How to use something | no | off (opt-in) |
| `ask` | Survey, feedback | no | off (opt-in) |
| `general` (default) | Anything else | no | none |

**Delivery** — `"delivery": "quiet"` (banner only) or `"popup"` (banner, and
once a pop-up). Left out, it follows the table; `"level": "urgent"` always
pops up and can't be dismissed. A pop-up arrives the way the user takes
reminders: a **card**, or a **system notification** if they chose that. At
most **one pop-up a day** from Sajilo, never while reminders are paused, and
each announcement pops up once.

**Screen** — `"screen": "bazar"` (or `news`, `rashifal`, `radio`,
`weather`) shows the banner on that screen instead of Today. Use it for
`status` notes ("NEPSE prices are delayed today").

**Targeting** — `minVersion` / `maxVersion` (inclusive, `"0.1.35"`),
`platforms` (`["windows", "macos", "linux"]`), `startsAt` / `expiresAt`, and
an optional `action` (`{ "url": "https://…", "label": { "en", "ne" } }`).

**Older versions** — only 0.1.35 and later read this file. To reach 0.1.34
and older, post through the old Worker: `bun run notices publish notice.json`
(`announce` offers this when an announcement targets them).

- Each `id` is shown once per user and remembered when dismissed, so give a
  new notice a new id.
- At most 5 banners show at once (urgent first); at most 20 fit in the file.

### A source broke: pause it

`flags.json`:

```json
{ "paused": { "rashifal": { "en": "Rashifal is paused while its source is fixed.",
                            "ne": "स्रोत मर्मत हुँदै गर्दा राशिफल रोकिएको छ।" } } }
```

- The key is a module (`news`, `weather`, `forex`, `bazar`, `stocks`,
  `stocksLive`, `rashifal`, `radio`, `crypto`, `ipos`, `dividends`,
  `mutualFunds`, `nepseIntraday`, `announcement`) or one feed (`bazar.fuel`,
  `bazar.metals`, `bazar.vegetables`, `weather.kathmandu`).
- A paused feed isn't fetched. It keeps showing its last value, labelled by
  age; with nothing cached it shows the reason.
- Offline features (calendar, tools, notes, plans) can't be paused.
- Remove the entry once the parser fix has shipped.

### A source moved to a new URL

`sources.json`:

```json
{ "rewrites": { "https://old.example.com/feed": "https://new.example.com/rss" } }
```

The longest matching prefix wins and the rest of the URL is kept. Use it
when the page is the same and only the address changed; a changed page
layout needs a parser fix and a release (pause it until then).

### Add a newsroom

`news-sources.json`:

```json
{ "sources": [ { "id": "setopati", "name": "Setopati",
                 "feeds": ["https://www.setopati.com/feed"], "english": false } ] }
```

- Check the feed opens in a browser and is RSS or Atom.
- `id` is a lowercase slug and is permanent: users' filters are saved by it.
- Up to 20 sources, 1–4 feeds each, `https` only.
- It appears in the news picker after the app's next check; its headlines
  arrive at the next news refresh (up to 10 minutes).
- A site with no feed needs a parser in code.

### Fix radio

`radio.json`:

```json
{ "add": [ { "slug": "new-fm", "name": "New FM", "frequency": "100.1",
             "logoUrl": null, "streamUrl": "https://stream.example.com/new" } ],
  "hide": ["dead-fm"],
  "streams": { "kantipur-fm": "https://stream.example.com/kantipur" } }
```

- Slugs are Ratopati's (the last part of `ratopati.com/radio/<slug>`).
- `https` streams only; the app's webview can't play `http`.
- Test a stream URL in a browser first.

### A vegetable has no English name

`kalimati.json`: add `{ "ne": "ब्रोकाउली", "en": "Broccoli" }`. `ne` only needs
to be part of the board's name; the longest match wins, so `"भेडे खुर्सानी"`
(capsicum) beats `"खुर्सानी"` (chilli) whatever the order.

### Fix a phone number or link

`directory.json`: edit the entry in `contacts`, `websites`,
`reminderTemplates` or `renewalGuides`. Numbers are digits, `-` and `+`;
links are `https` or empty. Template `id`s are stored on users' reminders,
so don't rename them.

### Change jokes

`jokes.json`: `decks` has one list per break (`eyes`, `move`, `water`,
`breakfast`, `lunch`, `dinner`, `bedtime`, `endOfDay`). `done` has the
cheers after a break (`eyes`, `move`, `water`, and `any`).

- Each deck needs at least 3 lines; English at most 90 characters.
- No line twice in a deck.
- A user's edit of a line is keyed by its English text, so rewording a line
  drops that user's edit of it, as an app update always has.
- Keep the voice: Kathmandu-specific, about the day at the desk, never about
  anyone's family.

---

## Yearly: next year's festivals

1. When the new year's almanac is out, build its 12 month files in the same
   format as `data/calendar-events/2083/<month>.json`.
2. Put them in `calendar-years.json` under the year, as a list of 12 in
   month order:
   ```json
   { "years": { "2084": [ { "days": [ … ], "marriage": [ … ], "bratabandha": [ … ] }, … ] } }
   ```
3. Publish. Festivals show for the new year. Scrolling the calendar into it
   may need one app restart, because the year range is read at launch.
4. At the next app release, move the year into the bundled data and empty the pack:
   - add `data/calendar-events/2084/1.json`–`12.json`
   - bump `LAST_YEAR` in `crates/sajilo-core/build.rs` and the `EVENT_FILES`
     array size it writes
   - bump `LAST_EVENT_YEAR` in `crates/sajilo-core/src/calendar/events.rs`
   - set `calendar-years.json` back to `{ "years": {} }`

   The pack refuses a year that's already bundled, so step 4 is enforced.

At most two years fit in the pack (512 KB cap). The calendar engine ends at
2090 (`bikram_sambat::LAST_YEAR`); a year past that needs the engine's month
table extended in code first.

---

## Keys

Publishes are signed with a minisign key. The app holds two public keys,
`CURRENT` and `NEXT`, in `crates/sajilo-config/src/keys.rs`, and accepts a
manifest signed by either.

| Where | What |
|---|---|
| GitHub Environment `config-publish` | `CONFIG_SIGNING_KEY`, `CONFIG_SIGNING_KEY_PASSWORD` (the current key), `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Deployable from `main` only. |
| Your password manager | "Sajilo config signing keys": both secret keys, passwords and public keys |
| `~/.config/sajilo/config-signing/` | Local copy, for local test publishes. Optional. |

GitHub secrets can't be read back, so the password manager copy is the one
that matters.

### Rotate the key (it leaked, or on schedule)

1. Put the **next** key into the GitHub secrets (`CONFIG_SIGNING_KEY`,
   `CONFIG_SIGNING_KEY_PASSWORD`). Apps already trust it, so publishing keeps
   working with no release.
2. Make a new spare:
   ```bash
   SAJILO_CONFIG_SIGNING_KEY_PASSWORD="$(openssl rand -base64 24)" \
     cargo run -p sajilo-config-publish -- keygen --out ~/sajilo-new-key
   ```
   (Save the password you used; `keygen` prints the new public key.)
3. In `keys.rs`, set `CURRENT` to the old `NEXT` and `NEXT` to the new public
   key. Ship it in the next release.
4. Save the new spare in your password manager. After a leak, the leaked key
   stays trusted by installed apps until they update past step 3, so release
   soon.

### Both keys lost

Generate a new pair with `keygen`, put its public key in both slots of
`keys.rs`, set the GitHub secrets, and release. Apps older than that release
can't take new config until they update; everything they already have keeps
working.

### Cloudflare token

It needs "Edit Cloudflare Workers" on the account plus the `sajilo.fyi`
zone (for the `config.sajilo.fyi` custom domain). To replace it:

```bash
pbpaste | gh secret set CLOUDFLARE_API_TOKEN --env config-publish -R adarshaacharya/sajilo
```

(with the new token on the clipboard).

---

## Troubleshooting

### The Publish config workflow failed

| Step | Likely cause |
|---|---|
| Test the trust checks | A code change broke a pack test; fix in code |
| Build and sign | `SAJILO_CONFIG_SIGNING_KEY is not set` → secret missing; `Wrong password for that key` → password secret doesn't match the key; `data/config/x.json: …` → invalid pack |
| Deploy | Token missing, expired, or without Workers/zone permission |

A warning `this key is not one of the app's PUBLIC_KEYS` means CI is signing
with a key the app doesn't trust: every app will refuse the publish. Check
the secret matches a key in `keys.rs`.

### The app says "Couldn't check. Using the last good copy."

The error is logged to the terminal when running `bun run tauri dev`
(`sajilo: config check: …`).

| Error | Meaning |
|---|---|
| a transport / HTTP error | Offline, or `config.sajilo.fyi` unreachable. Retries in 30 min |
| `the manifest signature does not match any trusted key` | Signed with a key this build doesn't have (see Keys) |
| `manifest rev X is older than the applied rev Y` | An older publish was redeployed. Merge any new commit to publish a newer rev |
| `… does not match the hash the manifest names` | A pack file and the manifest disagree, a deploy half-finished. Re-run the latest Publish config |
| `jokes: …` (a pack name, then a problem) | The pack is signed but this build's bounds refuse it. Usually an older app meeting a newer rule; the rest still apply |
| `… is N bytes, more than …` | A pack over 512 KB or a manifest over 16 KB |

### Test a publish locally, without touching production

```bash
# 1. Sign a build with your local key into apps/config/dist
SAJILO_CONFIG_SIGNING_KEY="$(cat ~/.config/sajilo/config-signing/current/sajilo-config.key)" \
SAJILO_CONFIG_SIGNING_KEY_PASSWORD="$(cat ~/.config/sajilo/config-signing/current.password)" \
  cargo run -p sajilo-config-publish -- build --out apps/config/dist --rev 1 [--config /path/to/test/dir]

# 2. Serve it
cd apps/config && bun install && bun run dev        # http://localhost:8788

# 3. Point a debug build at it (debug builds only)
cd apps/desktop && SAJILO_CONFIG_HOST=http://localhost:8788 bun run tauri dev
```

Debug builds use their own data (`com.sajilo.dev`), so this never touches
your installed app. They store what they applied under the
`remoteConfig.v1` key in `sajilo.db`. `--config DIR` builds from a copy of
`data/config` so you can test a change without editing the real files.

---

## For developers: add a new pack type

1. **Decide it's data.** Content or a source address an admin changes, yes.
   Logic, UI layout, keys or telemetry rules, no.
2. **The type.** Put it in `crates/sajilo-core/src/config/<name>.rs` if the
   engine reads it, or next to its DTO in `crates/sajilo-api` if it's a
   wire type. Implement `Pack`, copying `kalimati.rs`:
   - `NAME` (the file name), `SCHEMA = 1`
   - `bundled_json()` with `include_str!` of the data file
   - `validate()`: every bound that must hold even for a signed pack
     (lengths, counts, `check::https_url`, slugs)
   - `slot()`
3. **The data file.** `data/config/<name>.json`, holding today's values so
   behaviour doesn't change.
4. **Register it** in `crates/sajilo-config/src/registry.rs` (`PACKS` and
   its length).
5. **Read it** where the value was hardcoded: `<Type>::active()`. For the
   frontend, add a command returning a DTO; never read packs from TS.
6. **Tests.** Bundled pack valid, an install overrides, bad packs refused.
   Global slots are per-process, so tests that install should reset after
   and not run in parallel with others touching the same pack.
7. **Docs.** A row in `data/config/README.md` and a section here.
8. If the new code lives outside the paths in
   `.github/workflows/publish-config.yml`, add them.

### Change a pack's shape

- **Additive** (a new optional field with `#[serde(default)]`): keep the
  schema. Older apps ignore the field.
- **Breaking:** bump `SCHEMA`. The publisher today emits one entry per pack;
  to serve both shapes until old apps age out, extend `build` in
  `apps/config-publish/src/main.rs` to also publish the old shape as a
  second entry (the manifest and the app's `select()` already support a
  list per pack, with `minApp` / `maxApp`).

### Where the code is

| Path | What |
|---|---|
| `crates/sajilo-core/src/config/` | `Pack` trait, slots, bounds helpers, most pack types |
| `crates/sajilo-api/src/{announcement,news,radio}.rs` | The announcements, news-sources and radio packs |
| `crates/sajilo-config/` | Manifest, signature, hash, rev, version selection, registry, public keys |
| `apps/config-publish/` | `check`, `build`, `keygen` |
| `apps/config/` | The static Worker (`wrangler.jsonc`, `_headers` written by `build`) |
| `apps/desktop/src-tauri/src/remote_config.rs` | Restore at launch, scheduled check, status and Check now commands |
| `apps/desktop/src-tauri/src/feed.rs` | Kill switches applied to every feed |
| `apps/desktop/src/features/settings/_components/content-section.tsx` | The App content row |
| `.github/workflows/publish-config.yml` | Sign and deploy on `main` |
