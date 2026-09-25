import { api } from "./ipc";

/** A feature name for the daily usage report: a screen, a tab, or an action. */
export type UsageEvent = `screen.${string}` | `tab.${string}` | `action.${string}`;

/**
 * Counts one use of a feature for the anonymous daily report. Fire and forget:
 * the shell drops any name not on its list, and counts nothing at all while
 * "Help improve Sajilo" is off. Never pass anything a person typed or chose.
 */
export function track(event: UsageEvent): void {
  api.recordUsage(event).catch(() => {});
}
