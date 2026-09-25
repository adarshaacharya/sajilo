/**
 * What the telemetry endpoint keeps of a ping's feature counts and settings.
 *
 * The app's own list decides what is sent; this decides what can be stored:
 * short lowercase names in three families and one-word values, so free text has
 * nowhere to go even from a modified client. Anything malformed is dropped
 * rather than failing the ping, so the install is still counted for the day.
 */

const MAX_EVENTS = 80;
const MAX_EVENT_COUNT = 100_000;
const MAX_SETTINGS = 24;
const EVENT_PATTERN = /^(?:screen|tab|action)\.[a-z0-9-]+(?:\.[a-z0-9-]+)?$/;
const MAX_EVENT_NAME = 48;
const SETTING_KEY_PATTERN = /^[a-zA-Z]{1,20}$/;
const SETTING_VALUE_PATTERN = /^[a-z-]{1,16}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The feature counts worth keeping. Anything malformed is dropped rather than
 * failing the ping: the install is still counted for the day.
 */
export function usageEvents(value: unknown): [string, number][] {
  if (!isPlainObject(value)) return [];
  const entries = Object.entries(value);
  if (entries.length > MAX_EVENTS) return [];
  return entries.filter(
    (entry): entry is [string, number] =>
      entry[0].length <= MAX_EVENT_NAME &&
      EVENT_PATTERN.test(entry[0]) &&
      Number.isInteger(entry[1]) &&
      (entry[1] as number) >= 1 &&
      (entry[1] as number) <= MAX_EVENT_COUNT,
  );
}

/** The display choices worth keeping, on the same terms as `usageEvents`. */
export function usageSettings(value: unknown): [string, string][] {
  if (!isPlainObject(value)) return [];
  const entries = Object.entries(value);
  if (entries.length > MAX_SETTINGS) return [];
  return entries.filter(
    (entry): entry is [string, string] =>
      SETTING_KEY_PATTERN.test(entry[0]) &&
      typeof entry[1] === "string" &&
      SETTING_VALUE_PATTERN.test(entry[1]),
  );
}
