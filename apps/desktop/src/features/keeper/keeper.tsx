import { type ReactNode, useEffect, useState } from "react";
import { useHeaderInner } from "../../shared/components/header-slot";
import { Icon } from "../../shared/components/icon";
import { Segmented } from "../../shared/components/segmented";
import { useSettings } from "../../shared/context/settings-context";
import {
  api,
  type KeeperDate,
  type KeeperItem,
  type KeeperPerson,
  type KeeperRecord,
  type KeeperRecordInput,
  type KeeperSnapshot,
} from "../../shared/lib/ipc";
import { AddPicker } from "./_components/add-picker";
import { GroupPage } from "./_components/group-page";
import { ItemEditor } from "./_components/item-editor";
import type { NewPerson } from "./_components/person-select";
import { RecordDetail } from "./_components/record-detail";
import { RecordEditor } from "./_components/record-editor";
import { DueTile, GroupRow, ItemGroupRow, ItemRow, TickButton } from "./_components/rows";
import {
  blankRecord,
  docTypeLabel,
  documentSpec,
  personName,
  recordInput,
  recordName,
} from "./_lib/documents";
import { groupDocuments, groupItems, groupName, itemGroupName } from "./_lib/groups";
import { dueLabel, dueTone, type I18nKey, id, type TFn, todayKeeperDate } from "./_lib/shared";
import { applyTemplate, blankItem, REMINDER_TEMPLATES } from "./_lib/templates";
import { upcomingOf } from "./_lib/upcoming";

/** Keeper's own navigation: a small stack, so back always means "the screen I
 * came from" — the add picker, a document reached through a link, the list. */
type Screen =
  | { name: "add"; only?: "documents" | "reminders" }
  /** Every document of one kind; see `_lib/groups`. */
  | { name: "group"; key: string }
  /** Every reminder of one kind. */
  | { name: "itemGroup"; key: string }
  | { name: "record"; id: string }
  | { name: "editRecord"; draft: KeeperRecordInput; newPerson: NewPerson | null }
  | { name: "editItem"; draft: KeeperItem; newPerson: NewPerson | null };

type View = "documents" | "reminders";
/** `null` is everyone; `""` is the user / household (no person). */
type PersonFilter = string | null;

export function Keeper() {
  const { t } = useSettings();
  const [data, setData] = useState<KeeperSnapshot>({ people: [], items: [], records: [] });
  const [stack, setStack] = useState<Screen[]>([]);
  const [view, setView] = useState<View>("documents");
  const [person, setPerson] = useState<PersonFilter>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .keeperSnapshot()
      .then(setData)
      .catch(() => setError(t("keeper.error-load")));
  }, [t]);

  const screen = stack.at(-1) ?? null;
  const push = (next: Screen) => setStack((current) => [...current, next]);
  const back = () => setStack((current) => current.slice(0, -1));
  /** Swap the top screen — an editor's draft changing in place. */
  const replace = (next: Screen) => setStack((current) => [...current.slice(0, -1), next]);

  const run = async (task: Promise<KeeperSnapshot>, failure: I18nKey) => {
    try {
      const next = await task;
      // The landing-page showcase answers writes with nothing; keep what's
      // on screen rather than blank it.
      if (next) setData(next);
      setError("");
      return next ?? data;
    } catch {
      setError(t(failure));
      return null;
    }
  };

  const confirm = async (title: string, body: string) => {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    return ask(body, { title, kind: "warning" });
  };

  /** The person a form is saved for: a family member typed in on the form is
   * created first. `undefined` means creating them failed. */
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

  /** New things default to whoever the list is filtered to. */
  const defaultPerson = person || null;

  const saveRecord = async (draft: KeeperRecordInput, newPerson: NewPerson | null) => {
    const personId = await ownerOf(draft.personId, newPerson);
    if (personId === undefined) return;
    const spec = documentSpec(draft);
    // A record-only document keeps no date; a date-less or one-off document
    // has nothing to repeat.
    const clean: KeeperRecordInput = {
      ...draft,
      personId,
      expiryDate: spec.kind === "record" ? null : draft.expiryDate,
      recurrence: spec.kind === "repeats" && draft.expiryDate ? draft.recurrence : "none",
      remindDays: spec.kind === "record" ? [] : draft.remindDays,
    };
    if (!(await run(api.saveKeeperRecord(clean), "keeper.error-save-record"))) return;
    // Land on the document's own page: back from an edit to the page it came
    // from, and a new one replaces the picker it was chosen in.
    setStack((current) => {
      const below = current.slice(0, -1);
      const top = below.at(-1);
      if (top?.name === "record" && top.id === draft.id) return below;
      const base = top?.name === "add" ? below.slice(0, -1) : below;
      return [...base, { name: "record", id: draft.id }];
    });
  };

  const deleteRecord = async (record: KeeperRecordInput) => {
    const ok = await confirm(
      t("keeper.delete-record-confirm-title"),
      t("keeper.delete-record-confirm-body"),
    );
    if (ok && (await run(api.deleteKeeperRecord(record.id), "keeper.error-save-record"))) {
      setStack([]);
    }
  };

  const saveItem = async (draft: KeeperItem, newPerson: NewPerson | null) => {
    const personId = await ownerOf(draft.personId, newPerson);
    if (personId === undefined) return;
    if (await run(api.saveKeeperItem({ ...draft, personId }), "keeper.error-save")) setStack([]);
  };

  const deleteItem = async (item: KeeperItem) => {
    const ok = await confirm(
      `${t("keeper.delete-confirm-title")} "${item.title}"`,
      t("keeper.delete-confirm-body"),
    );
    if (ok && (await run(api.deleteKeeperItem(item.id), "keeper.error-save"))) setStack([]);
  };

  /** Ticking a repeating reminder rolls it to its next date; ticking a
   * one-off finishes it; unticking a finished one reopens it. */
  const toggleItem = (item: KeeperItem) =>
    run(
      item.status === "completed"
        ? api.saveKeeperItem({ ...item, status: "active" })
        : api.completeKeeperItem(item.id),
      "keeper.error-save",
    );

  const current =
    screen?.name === "record" ? data.records.find((record) => record.id === screen.id) : undefined;

  const matchesFilter = (personId: string | null) =>
    person === null || (person === "" ? personId === null : personId === person);
  const group =
    screen?.name === "group"
      ? groupDocuments(data.records.filter((record) => matchesFilter(record.personId))).find(
          (entry) => entry.key === screen.key,
        )
      : undefined;
  const itemGroup =
    screen?.name === "itemGroup"
      ? groupItems(data.items.filter((item) => matchesFilter(item.personId))).find(
          (entry) => entry.key === screen.key,
        )
      : undefined;

  useHeaderInner(
    screen === null
      ? null
      : {
          title:
            screen.name === "add"
              ? t("keeper.add.title")
              : screen.name === "group"
                ? group
                  ? groupName(t, group)
                  : t("keeper.title")
                : screen.name === "itemGroup"
                  ? itemGroup
                    ? itemGroupName(itemGroup)
                    : t("keeper.title")
                  : screen.name === "record"
                    ? current
                      ? recordName(t, current)
                      : t("keeper.title")
                    : screen.name === "editRecord"
                      ? screen.draft.createdAt
                        ? `${t("keeper.edit")} · ${docTypeLabel(t, screen.draft.documentType)}`
                        : docTypeLabel(t, screen.draft.documentType)
                      : screen.draft.createdAt
                        ? t("keeper.edit-title")
                        : t("keeper.new-title"),
          onBack: back,
        },
  );

  const errorBanner = error ? (
    <p className="rounded-md bg-[color:color-mix(in_srgb,var(--color-holiday)_12%,transparent)] px-2 py-1.5 text-[10px] text-holiday">
      {error}
    </p>
  ) : null;

  /** A blank document of the same kind as `source` — for insurance or a
   * custom document, the same kind within it too. */
  const startAnother = (source: Pick<KeeperRecord, "documentType" | "details">) => {
    const draft = blankRecord(source.documentType, defaultPerson);
    for (const key of ["insuranceType", "customKind"]) {
      if (source.details[key]) draft.details[key] = source.details[key];
    }
    const spec = documentSpec(draft);
    push({
      name: "editRecord",
      draft: {
        ...draft,
        recurrence: spec.defaultRecurrence,
        remindDays: [...spec.defaultRemindDays],
      },
      newPerson: null,
    });
  };

  const pickerFor = (owner: string | null, only?: "documents" | "reminders") => (
    <AddPicker
      only={only}
      onDocument={(type) =>
        push({ name: "editRecord", draft: blankRecord(type, owner), newPerson: null })
      }
      onReminder={async (template) => {
        const item = {
          ...blankItem(await todayKeeperDate().catch(() => null)),
          personId: owner,
        };
        push({
          name: "editItem",
          draft: template ? applyTemplate(item, template) : item,
          newPerson: null,
        });
      }}
      t={t}
    />
  );

  /** A new reminder of the same kind: from the same template, or for one made
   * from scratch, under the same title. */
  const startAnotherItem = async (source: KeeperItem) => {
    const item = {
      ...blankItem(await todayKeeperDate().catch(() => null)),
      personId: defaultPerson,
    };
    const template = REMINDER_TEMPLATES.find((entry) => entry.id === source.template);
    push({
      name: "editItem",
      draft: template
        ? applyTemplate(item, template)
        : { ...item, title: source.title, category: source.category },
      newPerson: null,
    });
  };

  let body: ReactNode;
  if (screen?.name === "itemGroup" && itemGroup) {
    const [sample] = itemGroup.items;
    body = (
      <div className="space-y-2.5">
        <section className="surface-card px-3">
          {itemGroup.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              personName={item.personId ? personName(t, data.people, item.personId) : undefined}
              onOpen={() => push({ name: "editItem", draft: item, newPerson: null })}
              onComplete={() => toggleItem(item)}
              t={t}
            />
          ))}
        </section>
        <button
          type="button"
          onClick={() => sample && startAnotherItem(sample)}
          className="flex items-center gap-1 px-0.5 text-[10px] font-medium text-accent-mark hover:underline"
        >
          <Icon name="plus" className="size-2.5" />
          {t("keeper.add-another").replace("{type}", itemGroupName(itemGroup))}
        </button>
      </div>
    );
  } else if (screen?.name === "group" && group) {
    const [sample] = group.records;
    body = (
      <GroupPage
        name={groupName(t, group)}
        records={group.records}
        people={data.people}
        onOpen={(recordId) => push({ name: "record", id: recordId })}
        onAddAnother={() => sample && startAnother(sample)}
        t={t}
      />
    );
  } else if (screen?.name === "add") {
    body = pickerFor(defaultPerson, screen.only);
  } else if (screen?.name === "editRecord") {
    body = (
      <RecordEditor
        record={screen.draft}
        records={data.records}
        people={data.people}
        onChange={(draft) => replace({ ...screen, draft })}
        onSave={() => saveRecord(screen.draft, screen.newPerson)}
        onCancel={back}
        onDelete={screen.draft.createdAt ? () => deleteRecord(screen.draft) : undefined}
        newPerson={screen.newPerson}
        onNewPerson={(newPerson) => replace({ ...screen, newPerson })}
        t={t}
      />
    );
  } else if (screen?.name === "editItem") {
    body = (
      <ItemEditor
        item={screen.draft}
        people={data.people}
        onChange={(draft) => replace({ ...screen, draft })}
        onSave={() => saveItem(screen.draft, screen.newPerson)}
        onCancel={back}
        onDelete={screen.draft.createdAt ? () => deleteItem(screen.draft) : undefined}
        newPerson={screen.newPerson}
        onNewPerson={(newPerson) => replace({ ...screen, newPerson })}
        t={t}
      />
    );
  } else if (screen?.name === "record" && current) {
    body = (
      <RecordDetail
        record={current}
        records={data.records}
        people={data.people}
        onEdit={() => push({ name: "editRecord", draft: recordInput(current), newPerson: null })}
        onDelete={() => deleteRecord(recordInput(current))}
        onAddAnother={() => startAnother(current)}
        onAdvance={() => run(api.advanceKeeperRecord(current.id), "keeper.error-save-record")}
        onRenew={(expiryDate) =>
          run(
            api.saveKeeperRecord({ ...recordInput(current), expiryDate }),
            "keeper.error-save-record",
          )
        }
        onOpen={(recordId) => push({ name: "record", id: recordId })}
        t={t}
      />
    );
  } else if (data.records.length === 0 && data.items.length === 0) {
    // Nothing kept yet: the choices are the screen. A list, tabs, and an
    // empty card would only point at this same picker three different ways.
    body = (
      <>
        <p className="px-0.5 text-[11px] text-text-secondary">{t("keeper.tagline")}</p>
        {pickerFor(defaultPerson)}
        <p className="px-0.5 text-[10px] leading-relaxed text-text-muted">
          {t("keeper.footer-note")}
        </p>
      </>
    );
  } else {
    body = (
      <Home
        data={data}
        view={view}
        onView={setView}
        person={person}
        onPerson={setPerson}
        onAdd={() => push({ name: "add", only: view })}
        picker={(only) => pickerFor(defaultPerson, only)}
        onOpenGroup={(key) => push({ name: "group", key })}
        onOpenItemGroup={(key) => push({ name: "itemGroup", key })}
        onOpenRecord={(recordId) => push({ name: "record", id: recordId })}
        onOpenItem={(item) => push({ name: "editItem", draft: item, newPerson: null })}
        onToggleItem={toggleItem}
        t={t}
      />
    );
  }

  return (
    <div className="min-w-0 space-y-2.5">
      {errorBanner}
      {body}
    </div>
  );
}

function Home({
  data,
  view,
  onView,
  person,
  onPerson,
  onAdd,
  picker,
  onOpenGroup,
  onOpenItemGroup,
  onOpenRecord,
  onOpenItem,
  onToggleItem,
  t,
}: {
  data: KeeperSnapshot;
  view: View;
  onView: (view: View) => void;
  person: PersonFilter;
  onPerson: (person: PersonFilter) => void;
  onAdd: () => void;
  /** The add choices for one tab, shown in place when that tab is empty. */
  picker: (only: "documents" | "reminders") => ReactNode;
  onOpenGroup: (key: string) => void;
  onOpenItemGroup: (key: string) => void;
  onOpenRecord: (id: string) => void;
  onOpenItem: (item: KeeperItem) => void;
  onToggleItem: (item: KeeperItem) => void;
  t: TFn;
}) {
  const [search, setSearch] = useState("");
  const matchesPerson = (personId: string | null) =>
    person === null || (person === "" ? personId === null : personId === person);
  const nameOf = (personId: string | null) =>
    personId ? personName(t, data.people, personId) : undefined;

  const records = data.records.filter((record) => matchesPerson(record.personId));
  const items = data.items.filter((item) => matchesPerson(item.personId));
  const upcoming = upcomingOf(records, items).slice(0, 6);

  return (
    <>
      {data.people.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {[
            { id: null, label: t("keeper.person.everyone") },
            { id: "", label: t("keeper.person.me") },
            ...data.people.map((entry) => ({ id: entry.id, label: entry.name })),
          ].map((chip) => (
            <button
              key={chip.id ?? "everyone"}
              type="button"
              aria-pressed={person === chip.id}
              onClick={() => onPerson(chip.id)}
              className={`rounded-full border px-2.5 py-0.5 text-[10px] transition-colors ${person === chip.id ? "border-[color:var(--color-accent-mark)] bg-[color:color-mix(in_srgb,var(--color-accent-mark)_12%,transparent)] text-accent-mark" : "border-control-border text-text-secondary hover:text-text"}`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <section aria-label={t("keeper.coming-up")} className="space-y-1">
          <h2 className="px-0.5 text-[11px] font-medium text-text-secondary">
            {t("keeper.coming-up")}
          </h2>
          <div className="surface-card px-3">
            {upcoming.map((entry) => {
              const personId = entry.record?.personId ?? entry.item?.personId ?? null;
              const item = entry.item;
              return (
                <div
                  key={entry.key}
                  className="flex items-center gap-2.5 border-b border-divider py-2 last:border-0"
                >
                  <button
                    type="button"
                    onClick={() =>
                      entry.record ? onOpenRecord(entry.record.id) : item && onOpenItem(item)
                    }
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    {(entry.record?.expiryDate ?? item?.dueDate) && (
                      <DueTile
                        date={(entry.record?.expiryDate ?? item?.dueDate) as KeeperDate}
                        days={entry.days}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium">
                        {entry.record ? recordName(t, entry.record) : item?.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-text-muted">
                        {[
                          nameOf(personId),
                          entry.record ? t("keeper.kind.document") : t("keeper.kind.reminder"),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        {" · "}
                        <span className={dueTone(entry.days)}>{dueLabel(t, entry.days)}</span>
                      </span>
                    </span>
                  </button>
                  {item && <TickButton item={item} onToggle={() => onToggleItem(item)} t={t} />}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Segmented
        label={t("keeper.title")}
        value={view}
        onChange={onView}
        scrollable={false}
        options={[
          { id: "documents" as const, label: t("keeper.tab-records") },
          { id: "reminders" as const, label: t("keeper.tab-reminders") },
        ]}
      />

      {view === "documents" ? (
        records.length === 0 ? (
          // An empty tab offers its own choices, not a button to a screen
          // that would.
          picker("documents")
        ) : (
          <DocumentList
            records={records}
            people={data.people}
            onOpen={onOpenRecord}
            onOpenGroup={onOpenGroup}
            onAdd={onAdd}
            t={t}
          />
        )
      ) : items.length === 0 ? (
        picker("reminders")
      ) : (
        <>
          <div className="control-field flex min-w-0 items-center gap-1.5 rounded-md px-2">
            <Icon name="search" className="size-3 text-text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("keeper.search-placeholder")}
              aria-label={t("keeper.search-placeholder")}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-[11px] outline-none placeholder:text-text-muted"
            />
          </div>
          <ReminderList
            items={items.filter((item) =>
              `${item.title} ${item.note}`.toLowerCase().includes(search.toLowerCase()),
            )}
            nameOf={nameOf}
            onOpenGroup={onOpenItemGroup}
            onAdd={onAdd}
            t={t}
          />
        </>
      )}

      <p className="px-0.5 text-[10px] leading-relaxed text-text-muted">
        {t("keeper.footer-note")}
      </p>
    </>
  );
}

function DocumentList({
  records,
  people,
  onOpen,
  onOpenGroup,
  onAdd,
  t,
}: {
  records: readonly KeeperRecord[];
  people: readonly KeeperPerson[];
  onOpen: (id: string) => void;
  onOpenGroup: (key: string) => void;
  onAdd: () => void;
  t: TFn;
}) {
  // One row per kind of paper. A kind with a single document opens it
  // straight away; two or more open the kind's own page.
  return (
    <section className="surface-card px-3">
      {groupDocuments(records).map((group) => {
        const [only] = group.records;
        return (
          <GroupRow
            key={group.key}
            name={groupName(t, group)}
            records={group.records}
            owners={group.records.map((record) => personName(t, people, record.personId))}
            onOpen={() =>
              group.records.length === 1 && only ? onOpen(only.id) : onOpenGroup(group.key)
            }
            t={t}
          />
        );
      })}
      <AddRow label={t("keeper.add-document")} onClick={onAdd} />
    </section>
  );
}

/** The list's last row: adding sits with what it adds to, under the tab that
 * says which kind. */
function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 py-2.5 text-left text-[11px] font-medium text-accent-mark"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[5px] border border-dashed border-[color:color-mix(in_srgb,var(--color-accent-mark)_45%,transparent)]">
        <Icon name="plus" className="size-3" />
      </span>
      {label}
    </button>
  );
}

function ReminderList({
  items,
  nameOf,
  onOpenGroup,
  onAdd,
  t,
}: {
  items: readonly KeeperItem[];
  nameOf: (personId: string | null) => string | undefined;
  onOpenGroup: (key: string) => void;
  onAdd: () => void;
  t: TFn;
}) {
  if (items.length === 0) {
    return (
      <EmptyState title={t("keeper.empty-search-title")} body={t("keeper.empty-search-body")} />
    );
  }
  // One row per kind, each opening its page: that's where the tick boxes and
  // "Add another" live, whether the kind holds one reminder or five.
  return (
    <section className="surface-card px-3">
      {groupItems(items).map((group) => {
        const name = itemGroupName(group);
        // Renamed members (Netflix, Spotify) say more than whose they are.
        const titles = [...new Set(group.items.map((item) => item.title))].filter(
          (title) => title !== name,
        );
        const owners = [
          ...new Set(group.items.map((item) => nameOf(item.personId) ?? t("keeper.person.me"))),
        ];
        return (
          <ItemGroupRow
            key={group.key}
            name={name}
            items={group.items}
            detail={(titles.length > 0 ? titles : owners).join(" · ")}
            onOpen={() => onOpenGroup(group.key)}
            t={t}
          />
        );
      })}
      <AddRow label={t("keeper.add-reminder")} onClick={onAdd} />
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="surface-card px-4 py-8 text-center">
      <Icon name="keeper" className="mx-auto size-6 text-text-muted" />
      <p className="mt-2 text-[12px] font-medium">{title}</p>
      <p className="mt-1 text-[10px] text-text-muted">{body}</p>
    </section>
  );
}
