import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "../../shared/components/icon";
import { currentDirectory, useDirectory } from "../../shared/lib/directory";
import { api, type KeeperItem, type KeeperPerson, type KeeperSnapshot } from "../../shared/lib/ipc";
import { withPopoverPinned } from "../../shared/lib/popover-dialog";
import { track } from "../../shared/lib/usage";
import { ItemEditor } from "./_components/item-editor";
import type { NewPerson } from "./_components/person-select";
import { usePhotoSummaries } from "./_components/photo-strip";
import { ItemGroupRow, ItemRow } from "./_components/rows";
import { personName, RECURRENCE_LABELS } from "./_lib/documents";
import { groupItems, type ItemGroup, itemGroupName } from "./_lib/groups";
import { REMINDER_ICONS } from "./_lib/icons";
import { type I18nKey, id, type TFn, todayKeeperDate } from "./_lib/shared";
import { applyTemplate, blankItem, type ReminderTemplate } from "./_lib/templates";

/**
 * Keeper's reminders, as the Bills screen shows them. Keeper stores the
 * household's bills alongside its documents; this is the part of it that
 * belongs in Bills, so that screen never reaches into Keeper's own pieces.
 */

export type { ItemGroup as BillGroup, NewPerson, ReminderTemplate };
export { groupItems as groupBills, ItemEditor as BillEditor, itemGroupName as billGroupName };

/** The household's bills and family, with what can be done to them. */
export function useBillReminders(t: TFn) {
  const [data, setData] = useState<KeeperSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .keeperSnapshot()
      .then(setData)
      .catch(() => setError(t("keeper.error-load")));
  }, [t]);

  const run = useCallback(
    async (task: Promise<KeeperSnapshot>, failure: I18nKey) => {
      try {
        const next = await task;
        // The landing-page showcase answers writes with nothing.
        if (next) setData(next);
        setError("");
        return true;
      } catch {
        setError(t(failure));
        return false;
      }
    },
    [t],
  );

  /** A family member typed in on the form is created first. `undefined`
   * means creating them failed. */
  const ownerOf = async (personId: string | null, newPerson: NewPerson | null) => {
    if (!newPerson?.name.trim()) return personId;
    const created: KeeperPerson = {
      id: id(),
      name: newPerson.name.trim(),
      relationship: newPerson.relationship.trim(),
      createdAt: "",
    };
    return (await run(api.saveKeeperPerson(created), "keeper.error-save")) ? created.id : undefined;
  };

  const save = async (draft: KeeperItem, newPerson: NewPerson | null) => {
    const personId = await ownerOf(draft.personId, newPerson);
    if (personId === undefined) return false;
    const ok = await run(api.saveKeeperItem({ ...draft, personId }), "keeper.error-save");
    if (ok) track("action.keeper-save");
    return ok;
  };

  const remove = async (item: KeeperItem) => {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    const ok = await withPopoverPinned(() =>
      ask(t("keeper.delete-confirm-body"), {
        title: `${t("keeper.delete-confirm-title")} "${item.title}"`,
        kind: "warning",
      }),
    );
    return ok && (await run(api.deleteKeeperItem(item.id), "keeper.error-save"));
  };

  /** Ticking a repeating bill rolls it to its next date; ticking a one-off
   * finishes it; unticking a finished one reopens it. */
  const toggle = (item: KeeperItem) =>
    run(
      item.status === "completed"
        ? api.saveKeeperItem({ ...item, status: "active" })
        : api.completeKeeperItem(item.id),
      "keeper.error-save",
    );

  /** A new bill, from a template or blank. */
  const draft = async (template: ReminderTemplate | null): Promise<KeeperItem> => {
    const item = blankItem(await todayKeeperDate().catch(() => null));
    return template ? applyTemplate(item, template) : item;
  };

  /** Another bill of the same kind as `source`. */
  const another = async (source: KeeperItem): Promise<KeeperItem> => {
    const template = currentDirectory().reminderTemplates.find(
      (entry) => entry.id === source.template,
    );
    const item = await draft(template ?? null);
    return template ? item : { ...item, title: source.title, category: source.category };
  };

  return {
    items: data?.items ?? [],
    people: data?.people ?? [],
    loaded: data !== null,
    error,
    save,
    remove,
    toggle,
    draft,
    another,
  };
}

/** One row per kind of bill, each opening its page. */
export function BillGroupRows({
  groups,
  people,
  onOpen,
  t,
}: {
  groups: readonly ItemGroup[];
  people: readonly KeeperPerson[];
  onOpen: (key: string) => void;
  t: TFn;
}) {
  return groups.map((group) => {
    const name = itemGroupName(group);
    // Renamed members (Netflix, Spotify) say more than whose they are.
    const titles = [...new Set(group.items.map((item) => item.title))].filter(
      (title) => title !== name,
    );
    const owners = [
      ...new Set(
        group.items.map((item) =>
          item.personId ? personName(t, people, item.personId) : t("keeper.person.me"),
        ),
      ),
    ];
    return (
      <ItemGroupRow
        key={group.key}
        name={name}
        items={group.items}
        detail={(titles.length > 0 ? titles : owners).join(" · ")}
        onOpen={() => onOpen(group.key)}
        t={t}
      />
    );
  });
}

/** Every bill of one kind, each with its tick. */
export function BillGroupList({
  group,
  people,
  onOpen,
  onToggle,
  t,
}: {
  group: ItemGroup;
  people: readonly KeeperPerson[];
  onOpen: (item: KeeperItem) => void;
  onToggle: (item: KeeperItem) => void;
  t: TFn;
}) {
  const photos = usePhotoSummaries("item");
  return (
    <section className="surface-card px-3">
      {group.items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          personName={item.personId ? personName(t, people, item.personId) : undefined}
          photos={photos.get(item.id)}
          onOpen={() => onOpen(item)}
          onComplete={() => onToggle(item)}
          t={t}
        />
      ))}
    </section>
  );
}

/** Kinds of bill a reminder can start from. Medicine moved to day plans. */
const NOT_BILLS = new Set(["medicine"]);

/** The bills to pick from, each with how often it repeats, then a blank one. */
export function BillPicker({
  onPick,
  t,
}: {
  /** `null` starts a blank bill. */
  onPick: (template: ReminderTemplate | null) => void;
  t: TFn;
}) {
  const { reminderTemplates } = useDirectory();
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {reminderTemplates
        .filter((template) => !NOT_BILLS.has(template.id))
        .map((template) => (
          <PickerTile
            key={template.id}
            icon={REMINDER_ICONS[template.id] ?? "bills"}
            label={template.title}
            hint={template.recurrence ? t(RECURRENCE_LABELS[template.recurrence]) : undefined}
            onClick={() => onPick(template)}
          />
        ))}
      <PickerTile
        icon="ellipsis"
        label={t("keeper.add.other")}
        hint={t("keeper.hint.your-own")}
        onClick={() => onPick(null)}
      />
    </div>
  );
}

export function PickerTile({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface-card group flex items-center gap-2 px-2 py-2 text-left transition-colors hover:bg-surface-hover"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-[6px] bg-[color:color-mix(in_srgb,var(--color-accent-mark)_14%,transparent)] text-accent-mark transition-colors group-hover:bg-[color:color-mix(in_srgb,var(--color-accent-mark)_22%,transparent)]">
        <Icon name={icon} className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-medium">{label}</span>
        {hint && <span className="mt-px block truncate text-[9.5px] text-text-muted">{hint}</span>}
      </span>
    </button>
  );
}
