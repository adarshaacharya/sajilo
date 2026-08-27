# Showcase

The landing page's carousel does not show screenshots. It embeds this — the
desktop app itself, running in an `<iframe>`, one screen per slide.

That is the whole point. A screenshot is a claim about the product that stops
being true the moment the product changes, and nobody notices, because a picture
of a stale UI still looks like a UI. This renders `apps/desktop/src` directly:
the same components, the same stylesheet, the same router. A redesign lands on
the landing page the next time it is built, and a screen that breaks breaks
visibly.

## What is different from the real app

Two things, and only two.

**There is no Tauri.** `src/tauri-stub/` stands in for it. Every `invoke` is
answered from `src/data/scenes.json`; the plugins the app imports are no-ops,
except the opener, which turns a headline into a new browser tab instead of a
system browser window.

**There is no network.** `scenes.json` is a recording, not a mock. It is written
by `apps/showcase-data`, which runs the same `sajilo-core` calendar engine and
the same `sajilo-providers` parsers the desktop app runs, over the fixtures in
`fixtures/`. Nothing in it is hand-written sample data, so no screen here can
show a number the product could not produce.

The recording is pinned to one Nepali day — a calendar app has to be *on* a
date. Instants are slid forward at load time so a recorded headline still reads
"2 hours ago"; dates are left alone.

## Regenerating

```sh
cd apps/showcase
bun run data     # re-reads fixtures/ -> src/data/scenes.json
bun run build    # -> apps/landing/assets/app/
```

Both outputs are committed: the landing site is a folder of files served by a
Worker, with no build step of its own, so `assets/app/` has to be in the tree
for a deploy to carry it.

`bun run dev` serves a single panel — `http://localhost:5173/?route=/news`, and
`&inert=1` for the non-interactive form the carousel embeds.
