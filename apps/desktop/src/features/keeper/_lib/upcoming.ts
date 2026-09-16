import type { KeeperItem, KeeperRecord } from "../../../shared/lib/ipc";
import { documentSpec } from "./documents";
import { daysUntil } from "./shared";

export type Upcoming = {
  key: string;
  /** Days until due; negative once overdue. */
  days: number;
  record?: KeeperRecord;
  item?: KeeperItem;
};

/** Everything with a date that needs attention soon, documents and reminders
 * together, most urgent first. A document gets a longer runway than a bill:
 * renewing a passport takes weeks, paying rent takes a minute. */
export function upcomingOf(records: readonly KeeperRecord[], items: readonly KeeperItem[]) {
  const entries: Upcoming[] = [];
  for (const record of records) {
    if (!record.expiryDate || documentSpec(record).kind === "record") continue;
    const days = daysUntil(record.expiryDate.ad);
    if (days <= 60) entries.push({ key: `r:${record.id}`, days, record });
  }
  for (const item of items) {
    if (item.status !== "active" || !item.dueDate) continue;
    const days = daysUntil(item.dueDate.ad);
    if (days <= 14) entries.push({ key: `i:${item.id}`, days, item });
  }
  return entries.sort((a, b) => a.days - b.days);
}
