import { type ReactNode, useEffect, useState } from "react";
import { useHeaderInner } from "../../shared/components/header-slot";
import { Icon } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import {
  api,
  type KeeperDocumentType,
  type KeeperPerson,
  type KeeperRecord,
  type KeeperRecordInput,
  type KeeperSnapshot,
} from "../../shared/lib/ipc";
import { withPopoverPinned } from "../../shared/lib/popover-dialog";
import { track } from "../../shared/lib/usage";
import { AddPicker } from "./_components/add-picker";
import { GroupPage } from "./_components/group-page";
import { Home, type PersonFilter } from "./_components/home";
import type { NewPerson } from "./_components/person-select";
import { RecordDetail } from "./_components/record-detail";
import { RecordEditor } from "./_components/record-editor";
import { Starters } from "./_components/starters";
import { blankRecord, docTypeLabel, documentSpec, recordInput, recordName } from "./_lib/documents";
import { groupDocuments, groupName } from "./_lib/groups";
import { type I18nKey, id } from "./_lib/shared";

/** The documents screen's own navigation: a small stack, so back always means
 * "the screen I came from" — the add picker, a document reached through a
 * link, the list. Keeper also stores the household's bills; those are shown
 * in Bills (`bill-reminders.tsx`). */
type Screen =
  | { name: "add" }
  /** Every document of one kind; see `_lib/groups`. */
  | { name: "group"; key: string }
  | { name: "record"; id: string }
  | { name: "editRecord"; draft: KeeperRecordInput; newPerson: NewPerson | null };

export function Keeper() {
  const { t } = useSettings();
  const [data, setData] = useState<KeeperSnapshot>({ people: [], items: [], records: [] });
  const [stack, setStack] = useState<Screen[]>([]);
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
  const back = () =>
    setStack((current) => {
      // Leaving a form that was never saved: its photos have nothing to
      // belong to.
      const top = current.at(-1);
      if (top?.name === "editRecord" && !top.draft.createdAt) {
        api.discardKeeperAttachments("record", top.draft.id).catch(() => {});
      }
      return current.slice(0, -1);
    });
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
    return withPopoverPinned(() => ask(body, { title, kind: "warning" }));
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
    track("action.keeper-save");
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
                : screen.name === "record"
                  ? current
                    ? recordName(t, current)
                    : t("keeper.title")
                  : screen.draft.createdAt
                    ? `${t("keeper.edit")} · ${docTypeLabel(t, screen.draft.documentType)}`
                    : docTypeLabel(t, screen.draft.documentType),
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

  const startDocument = (type: KeeperDocumentType, owner: string | null) =>
    push({ name: "editRecord", draft: blankRecord(type, owner), newPerson: null });
  const pickerFor = (owner: string | null) => (
    <AddPicker onDocument={(type) => startDocument(type, owner)} t={t} />
  );

  // Adding is always one tap away on the home screen: a full-width button at
  // the foot, saying what it adds, never a button in the app header.
  const onHome = screen === null;

  let body: ReactNode;
  if (screen?.name === "group" && group) {
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
    body = pickerFor(defaultPerson);
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
  } else if (data.records.length === 0) {
    // Nothing kept yet: a welcome and three one-tap starts, with the full
    // picker behind "See all types" and the header's Add.
    body = (
      <Starters
        onDocument={(type) => startDocument(type, defaultPerson)}
        onSeeAll={() => push({ name: "add" })}
        t={t}
      />
    );
  } else {
    body = (
      <Home
        data={data}
        person={person}
        onPerson={setPerson}
        onAdd={() => push({ name: "add" })}
        onOpenGroup={(key) => push({ name: "group", key })}
        onOpenRecord={(recordId) => push({ name: "record", id: recordId })}
        t={t}
      />
    );
  }

  return (
    <div className="min-w-0 space-y-2.5">
      {errorBanner}
      {body}
      {onHome && (
        <div className="keeper-add">
          <button
            type="button"
            onClick={() => setStack((current) => [...current, { name: "add" }])}
            className="keeper-add__btn"
          >
            <Icon name="plus" className="size-3.5" />
            {t("keeper.add-document")}
          </button>
        </div>
      )}
    </div>
  );
}
