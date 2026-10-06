import type { KeeperDate, KeeperItem } from "../../../shared/lib/ipc";
import type { ReminderTemplate } from "../../../types/api/ReminderTemplate";
import type { RenewalGuide } from "../../../types/api/RenewalGuide";
import { id } from "./shared";

/*
 * Template and guide content (titles, fees, offices, checklists, notes) is
 * English-only for now — it mirrors official form and office names, which
 * Nepali speakers commonly use in English day to day. Everything around it
 * (labels, buttons, categories) is localized.
 *
 * Checked against official and published sources in Bhadra 2083: DoTM /
 * EDLVRS for licences and bluebook tax, the Department of Passports, and
 * NEA's billing rules. Fees are pointers, not quotes — they change
 * every fiscal year, so each one says where to verify.
 */

export type { ReminderTemplate, RenewalGuide };

/* The templates and renewal guides themselves are the `directory` config
 * pack (`data/config/directory.json`): fees and checklists change every
 * fiscal year, and a pack fixes them without a release. Components read
 * them with `useDirectory()`; plain functions with `currentDirectory()`. */

export function blankItem(dueDate: KeeperDate | null): KeeperItem {
  return {
    id: id(),
    personId: null,
    title: "",
    category: "home",
    status: "active",
    dueDate,
    recurrence: "none",
    remindDays: [1, 0],
    note: "",
    officialUrl: "",
    officeLocation: "",
    fee: "",
    applicationStatus: "notStarted",
    checklist: [],
    createdAt: "",
    updatedAt: "",
    completedAt: null,
    template: null,
  };
}

/** A template's tips are kept on the reminder (in `checklist`, unchecked),
 * so they stay with it if the title is edited. */
export function applyTemplate(item: KeeperItem, template: ReminderTemplate): KeeperItem {
  return {
    ...item,
    template: template.id,
    title: template.title,
    category: template.category,
    recurrence: template.recurrence ?? item.recurrence,
    remindDays: [...template.remindDays],
    officialUrl: template.url,
    checklist: template.tips.map((label) => ({ id: id(), label, checked: false })),
  };
}
