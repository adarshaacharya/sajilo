---
target: Whole desktop shell (App.tsx + shared/ + index.css)
total_score: 23
p0_count: 1
p1_count: 3
timestamp: 2026-08-24T14-33-24Z
slug: apps-desktop-src
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | `StateBanner` is well-designed but the Dashboard bypasses it — loading is a single `…` glyph. Stale banner is near-invisible (`bg-surface` = `transparent`, 11px muted text). |
| 2 | Match System / Real World | 3 | BS-first, Devanagari numerals, macOS popover idiom all correct. Error text leaks raw Rust strings; `ErrorBoundary` copy is English-only. |
| 3 | User Control and Freedom | 3 | Escape dismisses, back button, retry on error boundary and state banner. No undo anywhere. |
| 4 | Consistency and Standards | 3 | Strong token layer, but `‹`/`›` text glyphs on the calendar vs `<Icon>` everywhere else; header suppressed on two routes with three different padding rules inline in `App.tsx`. |
| 5 | Error Prevention | 2 | No confirmation on module disable / data reset; no input constraints beyond `control-field`. |
| 6 | Recognition Rather Than Recall | 3 | Tab bar is labelled, not icon-only (good). But 6 of 13 routes (converter, day, events, weather, forex, settings) have no persistent entry point. |
| 7 | Flexibility and Efficiency | 1 | Escape is the only shortcut. No `⌘,` for settings, no arrow-key month stepping, no command palette, no tab cycling. |
| 8 | Aesthetic and Minimalist Design | 3 | Genuinely restrained and compact. Decoration is creeping: window-level radial wash plus six per-feature `::before` gradient tints. |
| 9 | Error Recovery | 2 | `setError(String(cause))` renders the raw error; messages name no fix; no `role="alert"`. |
| 10 | Help and Documentation | 1 | No contextual help, no tooltips, no first-run guidance. About tab only. |
| **Total** | | **23/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

**Does this look AI-generated? No.** This is the strongest thing about the shell. The CSS carries load-bearing comments explaining *why* (`"NSTextField has no visible up/down stepper by default"`, the Linux focus-blur note in `DismissOnEscape`), the token layer is hand-tuned to macOS vibrancy, and nothing reads as a Tailwind starter. It reads as a person who has used a Mac menu-bar app.

Register test (product): would someone fluent in Raycast / Fantastical trust this? Mostly yes. Where they'd pause: the `…` loading state, the invisible stale banner, and the absence of keyboard affordances.

**Deterministic scan** (`detect.mjs` over `apps/desktop/src`, exit 0): 1 finding — `bounce-easing` at `index.css:753` (`animation: eq-bounce`). **False positive.** That's the radio equalizer bar, `ease-in-out` `scaleY`, no bounce/elastic curve. The detector matched the keyframe *name*. Nothing to fix.

**Browser overlays: not run.** This is a Tauri popover whose entire data layer is `api.*` over Tauri IPC; `bun run dev` in a plain browser renders the shell with every call rejecting, which would have produced misleading evidence rather than none. No live-server injection was attempted, so there is no overlay in a browser tab. Findings below come from source review plus computed contrast ratios, not from a rendered page.

## Overall Impression

The craft is in the chrome and missing from the states. The token system, the vibrancy handling, the three-way theme resolution (`prefers-color-scheme` / `data-theme` / `data-window-material`) — that is careful, specific work. But the app's stated promise is *"remote modules must never silently show nothing — fresh, clearly labelled stale, or an explicit unavailable state"*, and the two places that promise gets drawn are the two weakest surfaces in the codebase.

Biggest opportunity: the light theme's muted ramp fails WCAG AA on exactly the text that carries freshness, source, and uncertainty. The product principle and the palette are in direct conflict.

## What's Working

1. **`StateBanner` as a single source of truth for honesty.** One component owns loading / stale / unavailable / failed, with a comment forbidding screens from inventing their own wording. Skeleton rows for loading, not a spinner. Stale still renders the data underneath. That is the right architecture — it's just under-styled and under-used.

2. **The tab bar respects working memory.** Seven tabs maximum, module-filtered so disabled features vanish rather than dead-end, text labels under every icon, `layoutId` pill that actually tracks. `header.tsx` even documents *why* Settings isn't a tab ("a seventh tab would cost every other tab the width its label needs"). That's a real decision, written down.

3. **Reduced motion is handled at the component boundary, not bolted on.** `useMotionEnabled()` short-circuits to a plain `<div>` — the animated variants never mount at all, so there's no half-applied transform. Plus explicit `@media (prefers-reduced-motion)` blocks for the CSS-only animations.

## Priority Issues

### [P0] Light theme muted text fails WCAG AA — on the freshness labels specifically

`--color-text-muted: #86868b` scores **3.25:1** on `#f2f2f7` and **3.62:1** on white cards. It needs 4.5:1. It is used at 10–11px for: card titles (`card.tsx`), the stale banner, the provisional-year note, inactive tab labels, and timestamps. Light-mode `--color-accent-mark: #a67c1a` is **3.41:1** — that's the *active* tab label at 10px.

Worse, in `.toggle-chip--on`, white on `#d4a84a` is **2.21:1** (dark theme) and **3.80:1** (light). The selected state of a settings control is the least readable text in the app.

Semantic colors on light: `--color-positive: #4ecf8a` is **1.77:1** on `#f2f2f7`, `--color-holiday: #ff6b6f` is **2.48:1**. Both are also meaning-by-color-alone (gain/loss, Saturday/holiday).

**Why it matters:** PRODUCT.md commits to "show freshness, source, and uncertainty explicitly" and "clear contrast." Right now the uncertainty labels are the *least* legible text on the light theme. A user in daylight cannot read the thing that tells them the number is old.

**Fix:** Darken the light ramp — `--color-text-muted` to roughly `#6b6b70` (≈4.6:1 on `#f2f2f7`), `--color-accent-mark` to `#8a6414` or darker for text use, and split accent-as-fill from accent-as-text (the toggle chip should use a darker fill or dark ink on the gilt). Give `--color-positive` / `--color-holiday` separate light-theme values and pair each with a glyph or `+`/`−` prefix so color isn't the only channel.

**Suggested command:** `/impeccable audit apps/desktop/src/index.css`

### [P1] The Dashboard's loading state is a single ellipsis

`features/calendar/dashboard.tsx:129` — `if (!today || !month) return <p className="text-text-muted">…</p>;`

This is the first frame of the app's primary screen, on every tray open, and it's one muted grey character at 3.25:1 in light mode. `StateBanner`'s skeleton exists three files away and isn't used here.

**Why it matters:** The tray popover's whole value is "answer a small practical question quickly." The first thing it shows is an unlabelled ellipsis with no layout, then a full reflow when data lands. Also violates the project's own never-show-nothing rule.

**Fix:** Render the real layout as a skeleton — date plate, month grid shell, glance card outlines — so the popover opens at final height and fills in. `StateBanner`'s `{ status: "loading" }` branch already does the pattern; extract the skeleton primitive and use it.

**Suggested command:** `/impeccable harden apps/desktop/src/features/calendar/dashboard.tsx`

### [P1] The stale banner — the product's core honesty affordance — is nearly invisible

`state-banner.tsx:50` styles it `bg-surface` (which resolves to `transparent`), `border-border` (9% of text color), `text-[11px] text-text-muted`. On light theme that's 3.25:1 text inside a 12%-opacity hairline on a transparent background. No icon, no accent, no `role="status"`.

**Why it matters:** This banner is the entire difference between "trustworthy" and "silently showing you a stale number." It is styled to be ignored. The failed/unavailable branch is worse — a bare `<p className="text-text-secondary">` with no icon and no `role="alert"`, so a screen reader announces nothing when a module dies.

**Fix:** Give stale a real tinted treatment (warm accent-tinted background, a clock glyph, `--color-text` not muted) and the same relative timestamp the rest of the app uses. Add `role="status"` to stale and `role="alert"` to failed. Never render `state.message` raw — map known failure kinds to plain sentences with a next step ("Couldn't reach the source. Showing yesterday's rates. Retry").

**Suggested command:** `/impeccable clarify apps/desktop/src/shared/components/state-banner.tsx`

### [P1] Nothing but form fields has a focus ring

`grep focus-visible` across `index.css` and `shared/` returns exactly one hit: `control.ts` for inputs. Zero for `.icon-btn`, `.btn-ghost`, `.settings-btn`, `.copy-chip`, `.toggle-chip`, `.tab-link`, `.rashifal-sign-cell`, `.weather-glass-btn`, or the calendar day cells. Combined with `user-select: none` on `.app-window` and Escape as the only shortcut, the keyboard story is thin.

**Why it matters:** In a 400px popover with no window chrome, keyboard users have no visible position. The calendar grid — the single densest interactive target in the app — has no focus treatment and no arrow-key navigation.

**Fix:** Add one `:focus-visible` rule keyed off `--color-accent-mark` and apply it to the shared button classes. Add roving-tabindex arrow navigation to `MonthGrid`, `⌘,` for Settings, `⌘[`/`⌘]` for back/forward.

**Suggested command:** `/impeccable audit apps/desktop/src/shared`

### [P2] Route transitions and dashboard stagger fight a menu-bar app's rhythm

`AnimatePresence mode="wait"` means the outgoing route fully exits before the incoming one enters — a spring out plus a spring in on every tab tap. On top of that, `Dashboard` wraps everything in `<Stagger>` (55ms per child, 40ms delay) so every single tray open replays an orchestrated entrance of the date header, clocks, calendar, event row, and glance cards.

**Why it matters:** The product register is explicit — 150–250ms, motion conveys state, no orchestrated page-load sequences. This app is opened dozens of times a day for a two-second glance. The choreography is charming once and friction the other forty times.

**Fix:** Drop `mode="wait"` for a crossfade, or cut the page transition to opacity-only at ~120ms. Keep the stagger for genuinely new content (a freshly loaded news list) and remove it from the dashboard's fixed chrome.

**Suggested command:** `/impeccable animate apps/desktop/src/App.tsx`

## Persona Red Flags

**Sam (accessibility-dependent)**: Tabs into the popover and cannot see where focus is — no `:focus-visible` on any button class. Cannot select or copy any text (`user-select: none` on `.app-window`); the `copy-chip` buttons are the only escape and they aren't announced as copy actions. On light theme, the freshness and provisional-year notes measure 3.25:1 — below AA at 10px. Forex gain/loss and Saturday/holiday are signalled by color alone. When a remote module fails, nothing is announced: no `role="alert"`, no `aria-live`.

**Alex (power user)**: Opens the tray, wants last week's date. No `⌘,`, no `⌘F`, no command palette, no arrow keys on the month grid — must mouse to a 28px `‹` glyph. Every tab tap costs an exit spring plus an enter spring. Escape is the only keystroke the app knows. Alex will keep using Fantastical.

**Jordan (first-timer)**: Opens Sajilo for the first time and sees `…`. Then a dense grid with no explanation of what BS means or which number is the Gregorian date. Seven tabs, no tooltips, no onboarding, no help. If a module errors on first launch, the message is a raw Rust `Err` string in English — untranslated even with the app set to Nepali.

**Bishnu (project persona — Nepali-first user, derived from PRODUCT.md)**: Sets the app to Nepali and Devanagari numerals. Everything translates until something breaks — then `error-boundary.tsx` says *"Something broke on this screen." / "Try again"* in hardcoded English, and `StateBanner`'s failed branch prints an untranslated upstream error. The two moments requiring the most trust are the two that drop out of his language.

## Minor Observations

- `useMotionEnabled()` reads `matchMedia` at render but never subscribes. Flip the OS reduced-motion setting and nothing updates until remount. Use `useSyncExternalStore` or a listener.
- `index.css` duplicates the entire light theme twice — once under `@media (prefers-color-scheme: light)` + `:not([data-theme="dark"])`, once under `[data-theme="light"]`. ~200 lines of copy-paste that will drift. Hoist the light values into a single `@layer` block referenced by both selectors, or use `light-dark()`.
- `Card`'s title is 10px uppercase tracked muted — the tiny-eyebrow shape. In product register a macOS section label is legitimate, but at 10px + 3.25:1 it isn't readable. Bump to 11px and `--color-text-secondary`.
- Calendar month nav uses raw `‹` / `›` text glyphs while every other control uses `<Icon>`. Font-dependent rendering and inconsistent optical weight.
- `App.tsx` encodes per-route padding as a nested ternary (`p-3` / `""` / `p-2.5`) and route-specific header suppression as an inline boolean. Move both onto the `ROUTES` entries.
- Dashboard's error path renders `String(cause)` inside a card titled `state.unavailable` — the title says unavailable, the body says something technical.
- `.surface-card` sets `backdrop-filter: blur(16px) saturate(1.35)` per card. On a scrolling dark-theme list that is a per-card compositing layer; worth measuring.

## Questions to Consider

- If the popover opened at final height with a skeleton and no entrance animation, would it feel faster or emptier? (It will feel faster.)
- The stale banner is the product's whole thesis. What would it look like if it were the most confident element on the screen instead of the quietest?
- Thirteen routes, seven tabs. Do converter / weather / forex / events belong in a `⌘K` palette rather than fighting for a dashboard glance card?
- Light theme currently reads as a desaturated copy of dark theme. What would a light theme designed first, for daylight, look like?
