# Notes — plan

Status: plan, not built.

> **Decided 2026-09-30: v1 lives in the popover only.** Sajilo is the small
> tray app, so Notes is a tab in the 380×560 popover. It has:
> - a jot box that appends to today's note
> - Notes and Tasks lists
> - a compact editor
> - search
>
> Pinning keeps it open for longer writing. The separate Notes window and
> the expanded two-column popover described below are **deferred**, not
> dropped: build them only if the popover proves too small in daily use. The
> mockup is https://claude.ai/artifact/4Wz1xiqiG8KusLG8iNniht.
>
> **No Tasks view in v1** (decided 2026-09-30). Checklists live inside
> notes, where people list anything at all (shopping, packing, ideas), so
> gathering every checkbox into one list would mix the random with the real
> to-dos. Sajilo already has day plans and Keeper for to-dos. A note in the
> list shows its open items as a small "☐ 2" badge. Bring a Tasks view back
> only if daily use asks for it.

## v1 scope: Apple Notes, in the popover

The feel to match is **Apple Notes**: simple, calm, obvious, fitted into the
380×560 popover. **Rule: if something needs more than one line of
explanation, it's not in v1.**

**In v1**

- **Folders:** Personal and Office by default (plus Daily, holding the
  daily notes).
  - Shown as a chip row above the list: All · Office · Personal · Daily · +.
  - A new note goes into the chosen folder; ⋯ → Move to changes it.
  - The editor's back button names the folder (‹ Office).
  - Folders are real folders in the vault.
- **Checklists stay in their notes:** `[]` becomes a checkbox, a note's
  open items show as a "☐ 2" badge in the list, and ⋯ → Remove ticked items
  tidies a note. There is no separate Tasks view.
- **No Markdown needed:**
  - `[]` becomes a checkbox; `-` and `1.` start lists.
  - Enter continues a list or checklist; Enter on an empty item ends it.
  - The format bar does the rest.
  - Markdown still works for those who know it.
- **The first line is the title.** No title field.
- **Opens where you left off:** the last note, with the cursor in place.
- **ने, romanized Nepali typing:** a toggle in the jot box and the format bar.
  With it on, `mero naam` becomes `मेरो नाम` as each word ends. Converted in
  Rust (a transliteration table in `sajilo-core`), so every platform behaves
  the same, and no system keyboard is needed.
- **⋯ → Copy as text:** clean text for Viber, WhatsApp or Messenger, with
  checkboxes as ☐/☑ and no Markdown symbols.
- **A welcome note** on first run, showing checklists, links, tags and ने;
  delete it any time.
- **Kept from before:** the jot box, `[[links]]` (with "Linked from" only when
  there are any), #tags, search, pin, BS daily notes, trash and history.

**Out of v1**

- @people: `[[links]]` do the job.
- A Tasks view, and dated tasks on the calendar.
- Callouts and tables.
- The separate window and the expanded popover.
- Graph view, locked notes, export.

A notes feature on the level of Apple Notes, Bear or Obsidian, not a text box:
Markdown written as you type, links between notes, tags, checklists, images,
instant search, all in English and Nepali, all on this computer. The part no
other notes app has is the **Bikram Sambat calendar**: a note for any BS day,
reached from the calendar Sajilo already shows.

## Decisions

| Question | Choice | Why |
|---|---|---|
| Editor | **CodeMirror 6**, Obsidian-style live preview | The document *is* the Markdown, so notes are saved exactly as typed. It's plain text underneath, so Nepali (Devanagari) input is the safest of all the options. It's what Obsidian uses. MIT, no paid tier. |
| Storage | **A folder of `.md` files** (the "vault"), with SQLite as an index | Notes are the user's files: they open in Obsidian or any editor, sync with iCloud, Dropbox or git, and survive Sajilo being uninstalled. |
| Search | SQLite **FTS5**, Nepali-aware tokenizer | Checked: the default tokenizer breaks Nepali words into fragments. `unicode61 categories 'L* N* Co M*'` keeps them whole. |
| Parsing | **comrak** in `sajilo-core` | A full syntax tree (GFM, tasks, wikilinks) for extracting links, tags and tasks, and rewriting links on rename. |

### Editors compared (Sep 2026)

| | Keeps Markdown exactly | Nepali input | Paid parts | Verdict |
|---|---|---|---|---|
| **CodeMirror 6** | ✅ exactly | best: plain text | none | **Chosen** |
| TipTap v3 + @tiptap/markdown | re-formats on save; "early release" | good (ProseMirror) | collaboration and AI | runner-up, for a Bear-style editor with no syntax visible |
| Milkdown Crepe | close, re-serialised | good | none | heavy, small team |
| Lexical | lossy | open Safari IME bugs | none | no |
| BlockNote | "lossy" by name | — | GPL or paid | no |
| Plate / MDXEditor | close | Slate / Lexical IME history | templates | no |

## The window

The popover is 380×560, too small to write in. Notes gets **its own window**:
- **Notes window**, 900×640, resizable, remembered: sidebar (folders, tags,
  pinned, recent), note list, editor. It opens from a Notes tab in the popover,
  from the tray menu, and with a global shortcut (⌥⌘N, configurable).
- **Quick note in the popover**: a Notes tab showing recent notes and a
  one-line "Jot something…" box. Enter saves it into today's note; ⌘↩ opens
  the full window.
- **The calendar**: each BS day in the Today screen gets "Note for this day",
  and a dot marks days that have one.

## Built for daily use

Sajilo Notes is meant to be the app opened many times a day: in a meeting,
on a call, when something is worth keeping. So the first rule is **capture
first, organise later**: from any screen to typing in under a second, with
nothing to decide first.

### Capturing in a hurry

- **⌥⌘N from anywhere** (Ctrl+Alt+N on Windows and Linux) opens a
  **capture panel** over whatever app is in front, like Spotlight. The cursor
  is already in the note. Esc hides it, and the note is already saved.
- The panel opens on **today's note** by default, with the time stamped as a
  heading when you start typing after a gap (`### 14:32`). A day of meetings
  becomes one readable log with no filing needed.
- **⌘↩ in the panel** turns what you've typed into its own note, titled from
  the first line and linked from today's note.
- **Paste anything:** a link becomes a titled link, an image is saved beside
  the note, a copied table stays a table.
- The popover's "Jot something…" box, from the tray, appends to today's note.

### Meetings

- `/meeting` (or the **New meeting** button) creates a note from the meeting
  template:
  ```
  # Budget review — Asoj 13, 2083
  **When:** 14:30 · **With:** [[Ramesh]], [[Sita]]
  ## Notes
  ## Decisions
  ## Action items
  - [ ]
  ```
- Typing `@` suggests people, who are notes of their own. A person's note
  lists every meeting they were in, through backlinks.
- **Action items** (`- [ ]`) from all meetings collect in the **To-do** view,
  where you can tick them off without opening each meeting.
- The meeting is linked from the day's note, so the calendar dot for that
  day leads to it.

### Finding it again: the search interface

One search box, **⌘K**, the same in the Notes window and the popover. It
answers as you type, with no Enter needed:

```
┌──────────────────────────────────────────────────────────┐
│ 🔍 budget ramesh                                         │
├──────────────────────────────────────────────────────────┤
│ NOTES                                                    │
│ ▸ Budget review            Asoj 13 · Meetings            │
│   "…agreed the **budget** with **Ramesh** by Kartik…"    │
│ ▸ Budget 2083              Bhadra 2 · Finance            │
│ TASKS                                                    │
│ ☐ Send **budget** sheet to **Ramesh**   in Budget review │
│ ACTIONS                                                  │
│ ＋ New note "budget ramesh"                              │
└──────────────────────────────────────────────────────────┘
  ↑↓ move · ↩ open · ⌘↩ open beside · Tab filter
```

- **Results are grouped** as notes, tasks, headings inside notes, and actions,
  with the matching words highlighted in a line of context.
- **Recent notes come first** when the box is empty, so ⌘K then ↩ reopens
  the last note.
- **Filter chips** appear after Tab: tag, folder, date (BS or AD, "this week",
  "Asoj"), has a task, has an image. Typing `tag:` or `in:` works too.
- **Nepali and English together,** and forgiving: typos and partial words
  still match ("budgt" finds "budget").
- **Search inside a note** with ⌘F: every match marked, ↩ for the next one.
- **The same box runs commands** when the query starts with `>`: new note,
  today's note, toggle focus mode, open settings.

### The note list

The middle column is where the day's notes are seen at a glance, not just a
list of titles:

```
┌──────────────────────────────┐
│ Today                        │
│ ▌Budget review        14:30  │
│  Agreed budget with Ramesh…  │
│  #meeting · ☐ 2 left         │
│ ─────────────────────────── │
│  Asoj 13 (today's note) 9:10 │
│  Standup, call dai, ideas…   │
│ Yesterday                    │
│  Books to read               │
│  📷 3 · #personal            │
│ This week  ·  Bhadra  ·  …   │
└──────────────────────────────┘
```

- **Grouped by day** (Today, Yesterday, This week, then by BS month), with
  pinned notes on top.
- Each row shows the **title, the first line, the time**, and small signs: open
  tasks left, images, tags. The open note is marked with a bar.
- **Hover** shows a larger preview; **right-click** or swipe offers pin, move,
  duplicate, copy link and delete.
- **Select several** (⌘-click or ⇧-click) to move, tag or delete together.
- Switch to a **compact view** (titles only) or a **card view** with images.
- Drag a note to a folder or tag in the sidebar.
- **Keyboard-driven**: ↑↓ through notes, ↩ to edit, ⌘⌫ to trash, ⌘D to pin.
  Everything works without a mouse.

### Making it feel alive

- **Instant:** the list, search and switching notes never wait on the disk,
  since the index is in memory and SQLite.
- **Small touches:**
  - a checkbox ticks with a little bounce and the line softly strikes
    through
  - a new note slides into the list
  - a link to a missing note shows dashed until created
  - "Saved" fades in quietly and never pops up
- **Open beside:** ⌘↩ from search opens a note in a second pane, so meeting
  notes and a reference can sit side by side.
- **Remembered:** the last note, where the cursor was, and the scroll are kept
  per note, even across restarts.

## Features

**Editor**
- Live preview: `**bold**` shows as bold, and the marks reappear only on the
  line being edited.
- Headings, bold, italic, strike, highlight (`==text==`), inline code, quotes,
  lists, horizontal rules.
- **Checklists** (`- [ ]`) you can click. Unfinished tasks from every note are
  collected in one list, with any date given (`📅 2083-06-15` or a BS date).
- **Tables**, edited in place: Tab to the next cell, a row added at the end.
- **Code blocks** with syntax colouring.
- **Images and files**: paste, drop or pick. Stored in `attachments/` beside
  the note with a relative link, shown inline and resizable.
- **Slash menu** (`/`): heading, checklist, table, image, date (BS or AD),
  divider, callout.
- **Callouts** (`> [!note]`, `> [!warning]`), as in Obsidian.
- **Keyboard**: ⌘B/I/K, ⌘⇧7 and ⌘⇧8 for lists, ⌘⇧L for a checklist, ⌘F to
  find, ⌘P to jump to a note. The same shortcuts use Ctrl on Windows and Linux.
- **Focus mode**: hide the sidebars, narrow the column.
- Word count, reading time, last edited.

**Linking**
- `[[Note name]]` with autocomplete while typing. ⌘-click (or Ctrl-click) opens
  the note; a link to a missing note creates it.
- **Backlinks** at the foot of each note, with the line that mentions it.
- `[[Note#Heading]]` links to a section.
- Renaming a note updates every link to it.

**Organising**
- Folders (real folders in the vault), **#tags** in Nepali too (`#काम`), and
  nested tags (`#work/sajilo`).
- Pin, sort (edited, created, title), and move by dragging.
- **Daily notes by the Bikram Sambat calendar**: `Daily/2083/06-Asoj/13.md`,
  created from a template, reached from the calendar or with ⌘⇧D.
- Templates (a folder of notes), with `{{date}}`, `{{bs-date}}` and `{{time}}`.

**Search**
- ⌘P quick switcher by title, fuzzy.
- ⌘⇧F full search: ranked results with the matching words highlighted,
  filters (`tag:`, `folder:`, `has:task`, `has:image`), works in Nepali.
- Search from the popover's Notes tab too.

**Safety**
- Saved as you type (debounced), written safely (a temporary file, then a
  rename), so a crash never leaves half a note.
- **Version history**: a snapshot on each save after a pause, kept 30 days,
  restorable.
- Trash for 30 days, not an instant delete.
- The vault is included in Sajilo's existing backup.
- Edits made outside Sajilo (Obsidian, a sync service) are picked up
  straight away; if the same note changed in both places, both versions are
  kept.

**Later**
- Lock a note (a password-encrypted file).
- Export to PDF or HTML.
- Share a note as an image.
- A graph view.

## Architecture

```
crates/sajilo-core/src/notes/        pure: no I/O
  parse.rs      comrak → title, headings, [[links]], #tags, tasks, dates
  links.rs      resolve [[Note]] to a path; rewrite links on rename
  daily.rs      BS date → daily-note path, and back
  template.rs   {{bs-date}} and friends
  search.rs     query parsing (tag:, folder:, has:) → an FTS5 query

apps/desktop/src-tauri/src/notes/
  vault.rs      pick, create and read the folder; atomic writes; trash; history
  index.rs      SQLite: notes, links, tags, tasks, FTS5; rebuilt from files
  watch.rs      `notify` crate: outside edits → re-index → event to the UI
  commands.rs   list, read, save, rename, move, delete, search, backlinks, tasks
  window.rs     the Notes window, and its size and place

apps/desktop/src/features/notes/
  notes-window.tsx     sidebar · list · editor
  _editor/             CodeMirror setup, live preview, wikilinks, tasks,
                       tables, images, slash menu, theme from CSS variables
  _components/         sidebar, note list, backlinks, search, switcher
  quick-note.tsx       the popover's Notes tab
```

Following CLAUDE.md: the frontend never works out a BS date or parses a note
for its links; it asks a command. `sajilo-core` stays free of I/O, and every
parser gets ordinary tests on recorded notes in `fixtures/notes/`.

**Index tables:** `notes(path, title, mtime, hash, created, words)`,
`links(from, to, line)`, `tags(path, tag)`,
`tasks(path, line, text, done, due_bs, due_ad)`, plus
`notes_fts(title, body)` with the Nepali-aware tokenizer. The text is
normalised to NFC before indexing and before querying.

## Phases

1. **Foundation (about 1–1.5 weeks):** the vault, the index, the Notes
   window, editing with live preview, autosave, folders, and the daily-use
   core:
   - the ⌥⌘N capture panel onto today's note
   - the grouped note list with previews
   - ⌘K search
   - the popover's quick note

   Usable on its own as the daily note-taking app.
2. **Linking (about 1 week):** wikilinks with autocomplete, backlinks,
   renaming, tags, full search with filters, BS daily notes, the calendar dot.
3. **Rich (about 1 week):** images and attachments, tables, the slash menu,
   callouts, the task list, templates.
4. **Safety and polish (about 1 week):** version history, trash, outside
   edits and conflicts, backup, focus mode, keyboard review, a Nepali
   input pass on all three platforms, landing docs.

Each phase ships on its own, behind a Notes module switch in Settings ›
Modules, like the other modules.

## Risks

- **Scope:** this is the biggest feature in Sajilo. Phase 1 must be good on
  its own; the rest can follow in later releases.
- **Nepali input:** test Devanagari typing in each phase on all three
  platforms (WKWebView, WebKitGTK, WebView2). Never swap in a widget on the
  line being typed.
- **Outside edits and sync conflicts:** keep both copies rather than guess.
- **A second window on Linux:** follow the popover's lessons
  (`docs/popover-window.md`); it's a normal window, so it's simpler.
