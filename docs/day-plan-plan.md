# Day plans as a to-do list — plan

Status: plan, not built. Mockup: the "Day plan" artboard in
https://claude.ai/artifact/4Wz1xiqiG8KusLG8iNniht.

## Why

Today a day plan is a small form: title, time, reminder, note, repeat, Save.
It works, but it feels like filling in a form, and a plan can't be ticked off,
so it never feels like a to-do list. People open a day to note *what* to do;
anything that slows that down gets skipped.

## The idea: type it, it's planned

One line at the top of the day's section, always ready:

```
┌──────────────────────────────────────────┐
│ ＋ Add a plan…  try "Call dai 3pm"       │
└──────────────────────────────────────────┘
   Call dai  🕒 3:00 PM  🔔 15 min before        ← chips appear as you type
```

- **Type in plain words; Sajilo picks out the rest.** Recognised parts turn into
  chips under the box as you type, and drop out of the title:
  - time: `3pm`, `3:30`, `15:00`, `बेलुका ५ बजे`
  - reminder: `remind 15m`, `remind 1h`, `remind day before`
  - repeat: `every month`, `every year`, `हरेक महिना`
- **Enter adds it.** The box clears and stays focused for the next one, so five
  plans take five lines and no clicks.
- **Tap a chip to undo it**, if the words meant something else ("3pm" in a
  title stays a title).
- Parsing happens in `sajilo-core` (pure, tested), like every other date rule;
  the screen only sends the line and shows what comes back.

## The list

```
DAY PLAN                              2 of 4 done
☐  Call dai                      3:00 PM  🔔
☐  Pay electricity bill                    ↻ monthly
☑  Book bus to Pokhara              (struck through, faded)
☑  Standup                        10:00 AM
```

- **Checkbox to tick off**, with a small bounce, and the row fades and moves to
  the bottom. A repeating plan is ticked off **for that day only**.
- **Sorted:** timed plans by time, then the rest, then done ones at the end.
- **Tap a row to edit it in place:** the title becomes a text field, with chips
  for time, reminder, repeat and note right under it. No separate form screen.
- **Delete** with the × that appears on hover (Undo for a few seconds).
- **Drag** isn't needed: time decides the order, and untimed ones stay in the order
  added.
- The header counts **"2 of 4 done"**, and Today's calendar shows a small dot on
  days with plans, which it already does.

## Notes and plans, together

- **Plans** are things to do on a day, with reminders. They live here.
- **Notes** are what you write. The day's note (from the Notes tab) is linked
  under the plans: **"Today's note →"**, or **"Write a note for this day"**
  when there isn't one.
- Each keeps its job; neither duplicates the other.

## Changes underneath

- `DayPlan` gains `done: BTreeSet<NepaliDate>`: the days it was ticked off.
  One-time plans hold one date, and repeating ones hold each day ticked, so
  ticking this month's rent doesn't tick next month's. It defaults to empty,
  so existing plans load unchanged, as with `recurrence` before it.
- `sajilo_core::planner::quick_add(line, language) -> QuickPlan { title, time,
  reminder, recurrence, spans }`. The spans let the screen show which words
  became chips. Tested with English, Nepali and mixed lines.
- Commands `plan_quick_parse(line)` (live, while typing) and
  `toggle_plan_done(id, date)`.
- Reminders skip a plan ticked off before its reminder fires.

## Steps

1. Core: `done`, `quick_add` with tests, and reminders that skip done plans.
2. Screen: the quick-add line with live chips, the checkable list, inline edit,
   delete with undo.
3. The day's-note link (once Notes ships).
4. Today screen: the "Up next" card shows unfinished plans only.

About a day of work.
