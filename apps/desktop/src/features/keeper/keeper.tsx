import { type ReactNode, useEffect, useState } from "react";
import { useHeaderInner } from "../../shared/components/header-slot";
import { Icon } from "../../shared/components/icon";
import { Segmented } from "../../shared/components/segmented";
import { useSettings } from "../../shared/context/settings-context";
import {
  api,
  type KeeperItem,
  type KeeperPerson,
  type KeeperRecord,
  type KeeperRecordInput,
  type KeeperSnapshot,
} from "../../shared/lib/ipc";
import { AddPicker } from "./_components/add-picker";
import { ItemEditor } from "./_components/item-editor";
import type { NewPerson } from "./_components/person-select";
import { RecordDetail } from "./_components/record-detail";
import { RecordEditor } from "./_components/record-editor";
import { ItemRow, RecordRow } from "./_components/rows";
import {
  blankRecord,
  docTypeLabel,
  documentSpec,
  personName,
  recordInput,
  recordName,
} from "./_lib/documents";
import { dueLabel, dueTone, type I18nKey, id, type TFn, todayKeeperDate } from "./_lib/shared";
import { applyTemplate, blankItem } from "./_lib/templates";
import { upcomingOf } from "./_lib/upcoming";

/** Keeper's own navigation: a small stack, so back always means "the screen I
 * came from" — the add picker, a document reached through a link, the list. */
type Screen =
  | { name: "add" }
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

  const toggleItem = (item: KeeperItem) =>
    run(
      api.saveKeeperItem({ ...item, status: item.status === "completed" ? "active" : "completed" }),
      "keeper.error-save",
    );

  const current =
    screen?.name === "record" ? data.records.find((record) => record.id === screen.id) : undefined;

  useHeaderInner(
    screen === null
      ? null
      : {
          title:
            screen.name === "add"
              ? t("keeper.add.title")
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

  const picker = (
    <AddPicker
      onDocument={(type) =>
        push({ name: "editRecord", draft: blankRecord(type, defaultPerson), newPerson: null })
      }
      onReminder={async (template) => {
        const item = {
          ...blankItem(await todayKeeperDate().catch(() => null)),
          personId: defaultPerson,
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

  let body: ReactNode;
  if (screen?.name === "add") {
    body = picker;
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
        {picker}
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
        onAdd={() => push({ name: "add" })}
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
      <div className="flex items-center justify-between gap-3 px-0.5">
        <p className="min-w-0 truncate text-[11px] text-text-secondary">
          {upcoming.length > 0
            ? `${upcoming.length} ${t("keeper.due-soon").toLowerCase()}`
            : t("keeper.tagline")}
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="settings-btn flex shrink-0 items-center gap-1 text-[11px]"
        >
          <Icon name="plus" className="size-3" /> {t("keeper.add")}
        </button>
      </div>

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
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() =>
                    entry.record
                      ? onOpenRecord(entry.record.id)
                      : entry.item && onOpenItem(entry.item)
                  }
                  className="flex w-full items-center gap-2 border-b border-divider py-2 text-left last:border-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium">
                      {entry.record ? recordName(t, entry.record) : entry.item?.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-text-muted">
                      {[
                        nameOf(personId),
                        entry.record ? t("keeper.kind.document") : t("keeper.kind.reminder"),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-[10px] font-medium tabular-nums ${dueTone(entry.days)}`}
                  >
                    {dueLabel(t, entry.days)}
                  </span>
                </button>
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
        <DocumentList
          records={records}
          people={data.people}
          grouped={person === null}
          onOpen={onOpenRecord}
          onAdd={onAdd}
          t={t}
        />
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
            hasAny={items.length > 0}
            nameOf={nameOf}
            onOpen={onOpenItem}
            onToggle={onToggleItem}
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
  grouped,
  onOpen,
  onAdd,
  t,
}: {
  records: readonly KeeperRecord[];
  people: readonly KeeperPerson[];
  /** Section by person when showing everyone; one person's list needs no
   * headings. */
  grouped: boolean;
  onOpen: (id: string) => void;
  onAdd: () => void;
  t: TFn;
}) {
  if (records.length === 0) {
    return (
      <EmptyState
        title={t("keeper.records-empty-title")}
        body={t("keeper.records-empty-body")}
        action={t("keeper.add-first-record")}
        onAction={onAdd}
      />
    );
  }
  const groups =
    grouped && people.length > 0
      ? [null, ...people.map((entry) => entry.id)]
          .map((personId) => ({
            key: personId ?? "me",
            heading: personName(t, people, personId),
            records: records.filter((record) => record.personId === personId),
          }))
          .filter((group) => group.records.length > 0)
      : [{ key: "all", heading: null, records }];

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.heading ?? undefined} className="space-y-1">
          {group.heading && (
            <h2 className="px-0.5 text-[11px] font-medium text-text-secondary">{group.heading}</h2>
          )}
          <div className="surface-card px-3">
            {group.records.map((record) => (
              <RecordRow key={record.id} record={record} onOpen={() => onOpen(record.id)} t={t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ReminderList({
  items,
  hasAny,
  nameOf,
  onOpen,
  onToggle,
  onAdd,
  t,
}: {
  items: readonly KeeperItem[];
  hasAny: boolean;
  nameOf: (personId: string | null) => string | undefined;
  onOpen: (item: KeeperItem) => void;
  onToggle: (item: KeeperItem) => void;
  onAdd: () => void;
  t: TFn;
}) {
  const sorted = [...items].sort((a, b) => {
    if (a.status !== b.status) return a.status === "completed" ? 1 : -1;
    // Undated items (applications with no deadline) follow dated ones.
    if (!a.dueDate || !b.dueDate) return a.dueDate ? -1 : b.dueDate ? 1 : 0;
    return a.dueDate.ad.localeCompare(b.dueDate.ad);
  });
  if (sorted.length === 0) {
    return (
      <EmptyState
        title={hasAny ? t("keeper.empty-search-title") : t("keeper.empty-title")}
        body={hasAny ? t("keeper.empty-search-body") : t("keeper.empty-body")}
        action={t("keeper.add-first")}
        onAction={onAdd}
      />
    );
  }
  return (
    <section className="surface-card px-3">
      {sorted.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          personName={nameOf(item.personId)}
          onOpen={() => onOpen(item)}
          onComplete={() => onToggle(item)}
          t={t}
        />
      ))}
    </section>
  );
}

function EmptyState({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <section className="surface-card px-4 py-8 text-center">
      <Icon name="keeper" className="mx-auto size-6 text-text-muted" />
      <p className="mt-2 text-[12px] font-medium">{title}</p>
      <p className="mt-1 text-[10px] text-text-muted">{body}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-3 text-[11px] text-accent-mark hover:underline"
      >
        {action}
      </button>
    </section>
  );
}
