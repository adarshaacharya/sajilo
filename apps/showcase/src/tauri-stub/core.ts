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

/** An accent asked for in the page's URL, for the theme section. */
const ACCENT = new URLSearchParams(window.location.search).get("accent");
/** A theme asked for in the page's URL, `light` or `dark`. */
const THEME = new URLSearchParams(window.location.search).get("theme");

interface Recording {
  recordedAt: string;
  commands: Record<string, unknown>;
}

/** The showcase is an ordinary browser page, even though it implements the
 * subset of IPC needed to render the real desktop UI. */
export function isTauri() {
  return false;
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
    case "get_fund_nav_history":
      return `get_fund_nav_history:${args.symbol}`;
    case "get_setting":
      return `get_setting:${args.key}`;
    case "shift_month":
      return `shift_month:${args.year}:${args.monthNumber}:${args.offset}`;
    case "group_number":
      return `group_number:${args.value}:${args.fractionDigits}`;
    case "get_crypto_chart":
      return `get_crypto_chart:${args.id}:${args.days}`;
    case "notes_open":
      return `notes_open:${args.id}`;
    case "get_rashifal_period":
      return `get_rashifal_period:${args.period}`;
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
  "record_usage",
  "save_plan",
  "delete_plan",
  "set_focus_settings",
  "enable_recommended_breaks",
  "log_focus_water",
  "pause_focus",
  "finish_focus_break",
  "preview_focus_break",
  "disable_breaks",
  "save_keeper_item",
  "delete_keeper_item",
  "save_keeper_person",
  "delete_keeper_person",
  "save_keeper_record",
  "advance_keeper_record",
  "complete_keeper_item",
  "add_keeper_attachments_from_paths",
  "add_keeper_attachment_bytes",
  "delete_keeper_attachment",
  "rotate_keeper_attachment",
  "export_keeper_attachment",
  "discard_keeper_attachments",
  "open_keeper_viewer",
  "delete_keeper_record",
  "set_notification_options",
  "notes_remember_cursor",
  "notes_pin",
  "notes_move",
  "notes_trash",
  "notes_restore",
  "preview_reminder_card",
  "dismiss_reminder",
  "dismiss_announcement",
  "update_installed",
  "set_audio_playing",
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

/**
 * Answers the promo video's capture script may set before the app loads
 * (`apps/promo/capture.mjs`), keyed like the recording. Only for what belongs
 * to a viewer and so can never be recorded: their Keeper documents, their
 * Routine, a first-run flag. Market data, news and weather always come from
 * the recording. The public site never sets this.
 */
function promoAnswer(command: string, args?: Args): unknown {
  const promo = (globalThis as { __SAJILO_PROMO__?: Record<string, unknown> }).__SAJILO_PROMO__;
  if (!promo) return undefined;
  const exact = promo[key(command, args)];
  return exact === undefined ? promo[command] : exact;
}

export async function invoke<T>(command: string, args?: Args): Promise<T> {
  const promo = promoAnswer(command, args);
  if (promo !== undefined) return promo as T;

  // Personal portfolio rows are intentionally absent from the public showcase.
  // Return the real command's empty-state shape rather than inventing holdings.
  if (
    command === "stock_portfolio" ||
    command === "save_stock_transaction" ||
    command === "delete_stock_transaction"
  ) {
    return {
      invested: 0,
      marketValue: 0,
      unrealisedProfitLoss: 0,
      realisedProfitLoss: 0,
      positions: [],
    } as T;
  }
  if (WRITES.has(command)) return undefined as T;

  // The theme section shows the app in each accent: `?accent=phewa` answers
  // the one setting that decides it, so nothing else about the scene changes.
  if (command === "get_setting" && args?.key === "accent" && ACCENT) return ACCENT as T;
  // Likewise `?theme=light`: the saved theme would otherwise win once loaded.
  if (command === "get_setting" && args?.key === "theme" && THEME) return THEME as T;

  // Typing in Notes in the lightbox saves into nothing; the editor still
  // needs a revision back, or it reports the save as failed.
  if (command === "notes_save") {
    return { id: args?.id, revision: Number(args?.revision ?? 0) + 1, title: "" } as T;
  }

  const { recordedAt, commands } = await loaded;
  const exact = commands[key(command, args)];
  const answer = exact === undefined ? commands[command] : exact;
  if (answer === undefined) return null as T;

  return shift(answer, Date.now() - Date.parse(recordedAt)) as T;
}
