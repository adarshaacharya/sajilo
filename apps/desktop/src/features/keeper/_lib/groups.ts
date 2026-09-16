import type { KeeperDocumentType, KeeperItem, KeeperRecord } from "../../../shared/lib/ipc";
import { DOCUMENT_TYPES, docTypeLabel, recordName } from "./documents";
import type { TFn } from "./shared";
import { REMINDER_TEMPLATES } from "./templates";

/** Every document of one kind: all the citizenships, all the passports. A
 * custom document is its own kind, keyed by the name the user gave it. */
export type DocumentGroup = {
  key: string;
  type: KeeperDocumentType;
  /** Soonest to lapse first; papers with no date after, newest first. */
  records: KeeperRecord[];
};

export function groupKey(record: KeeperRecord) {
  return record.documentType === "custom"
    ? `custom:${(record.details.name ?? "").trim().toLowerCase()}`
    : record.documentType;
}

function bySoonest(a: KeeperRecord, b: KeeperRecord) {
  const ad = a.expiryDate?.ad;
  const bd = b.expiryDate?.ad;
  if (ad && bd && ad !== bd) return ad.localeCompare(bd);
  if (ad !== bd) return ad ? -1 : 1;
  return b.createdAt.localeCompare(a.createdAt);
}

/** Groups in the order the add screen lists the kinds; custom kinds last, in
 * the order they were first added. */
export function groupDocuments(records: readonly KeeperRecord[]): DocumentGroup[] {
  const groups = new Map<string, DocumentGroup>();
  for (const record of [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const key = groupKey(record);
    const group = groups.get(key) ?? { key, type: record.documentType, records: [] };
    group.records.push(record);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, records: group.records.sort(bySoonest) }))
    .sort((a, b) => DOCUMENT_TYPES.indexOf(a.type) - DOCUMENT_TYPES.indexOf(b.type));
}

export function groupName(t: TFn, group: DocumentGroup) {
  const [first] = group.records;
  return group.type === "custom" && first ? recordName(t, first) : docTypeLabel(t, group.type);
}

/** Reminders of one kind: every subscription, every electricity bill. Kind is
 * the template a reminder started from; one made from scratch is its own
 * kind, by title. */
export type ItemGroup = {
  key: string;
  template: string | null;
  /** Open ones by soonest due (undated after), then done ones. */
  items: KeeperItem[];
};

function itemKey(item: KeeperItem) {
  return item.template ? `t:${item.template}` : `n:${item.title.trim().toLowerCase()}`;
}

function bySoonestOpen(a: KeeperItem, b: KeeperItem) {
  if (a.status !== b.status) return a.status === "completed" ? 1 : -1;
  const ad = a.dueDate?.ad;
  const bd = b.dueDate?.ad;
  if (ad && bd && ad !== bd) return ad.localeCompare(bd);
  if (ad !== bd) return ad ? -1 : 1;
  return b.createdAt.localeCompare(a.createdAt);
}

/** Groups ordered by their most pressing reminder, so what is due first still
 * leads the list. */
export function groupItems(items: readonly KeeperItem[]): ItemGroup[] {
  const groups = new Map<string, ItemGroup>();
  for (const item of items) {
    const key = itemKey(item);
    const group = groups.get(key) ?? { key, template: item.template, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, items: group.items.sort(bySoonestOpen) }))
    .sort((a, b) => {
      const [first] = a.items;
      const [second] = b.items;
      return first && second ? bySoonestOpen(first, second) : 0;
    });
}

export function itemGroupName(group: ItemGroup) {
  const template = REMINDER_TEMPLATES.find((entry) => entry.id === group.template);
  return template?.title ?? group.items[0]?.title ?? "";
}
