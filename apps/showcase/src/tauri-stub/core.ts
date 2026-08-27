/**
 * The IPC boundary, answered from a recording instead of from Rust.
 *
 * `apps/showcase-data` runs the same `sajilo-core` calendar engine and the same
 * `sajilo-providers` parsers the desktop app runs, against the fixtures in
 * `fixtures/`, and writes the result to `scenes.json`. So what the landing page
 * renders is the real UI fed the real shapes — not a mock of either.
 *
 * A command with no recorded answer resolves to `null`. Every screen already
 * handles a null or empty payload, because the desktop app has to survive a
 * source being down.
 */
import scenesUrl from "../data/scenes.json?url";

type Args = Record<string, unknown> | undefined;

interface Recording {
  recordedAt: string;
  commands: Record<string, unknown>;
}

/* Fetched rather than imported so the recording stays a separate, cacheable
 * asset instead of a megabyte of JSON inlined into the JavaScript bundle. Every
 * caller is already async, so nothing has to wait synchronously for it. */
const loaded: Promise<Recording> = fetch(scenesUrl).then((response) => response.json());

/** Commands whose answer depends on their arguments get one entry per call,
 * keyed by the arguments the showcase actually makes. */
function key(command: string, args: Args): string {
  if (!args) return command;
  switch (command) {
    case "month_grid":
      return `month_grid:${args.year}:${args.monthNumber}`;
    case "events_for":
      return `events_for:${args.year}:${args.monthNumber}:${args.day}`;
    case "plans_for_day":
      return `plans_for_day:${args.year}:${args.month}:${args.day}`;
    case "panchanga_for":
      return `panchanga_for:${args.isoDate}`;
    case "get_setting":
      return `get_setting:${args.key}`;
    case "shift_month":
      return `shift_month:${args.year}:${args.monthNumber}:${args.offset}`;
    case "group_number":
      return `group_number:${args.value}:${args.fractionDigits}`;
    default:
      return command;
  }
}

/** Writes are accepted and dropped. The showcase is a display: a visitor
 * toggling something should see it react, and should not have it persist into
 * the next visitor's session. */
const WRITES = new Set([
  "set_setting",
  "delete_setting",
  "save_plan",
  "delete_plan",
  "save_keeper_item",
  "delete_keeper_item",
  "save_keeper_person",
  "delete_keeper_person",
  "save_keeper_record",
  "delete_keeper_record",
  "set_notification_options",
  "set_autostart",
  "set_dock_icon_visible",
  "refresh_tray",
  "hide_popover",
  "mark_launched",
  "export_backup",
  "import_backup",
]);

/*
 * The recording is pinned to the day it was made, which is right for the
 * calendar — a Bikram Sambat grid is *of* a date — and wrong for everything
 * measured against the clock. Left alone, a headline the app renders as "2
 * hours ago" would read "8 months ago" by the time anyone visited.
 *
 * So instants move and dates do not. Every `published`, `fetchedAt` and
 * `sourceTimestamp` is slid forward by the age of the recording, which keeps
 * the intervals between them exactly as they were: the newest headline is as
 * fresh as it was when recorded, and the one below it is still the hour older
 * that it really is.
 */
const INSTANT_FIELDS = new Set(["published", "fetchedAt", "sourceTimestamp"]);

function shift(value: unknown, drift: number): unknown {
  if (Array.isArray(value)) return value.map((item) => shift(item, drift));
  if (value === null || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [field, held] of Object.entries(value as Record<string, unknown>)) {
    out[field] =
      INSTANT_FIELDS.has(field) && typeof held === "string"
        ? new Date(Date.parse(held) + drift).toISOString()
        : shift(held, drift);
  }
  return out;
}

export async function invoke<T>(command: string, args?: Args): Promise<T> {
  if (WRITES.has(command)) return undefined as T;

  const { recordedAt, commands } = await loaded;
  const exact = commands[key(command, args)];
  const answer = exact === undefined ? commands[command] : exact;
  if (answer === undefined) return null as T;

  return shift(answer, Date.now() - Date.parse(recordedAt)) as T;
}
