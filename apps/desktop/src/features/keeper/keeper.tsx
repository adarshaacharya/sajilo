import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import useSWR from "swr";
import { useHeaderInner, useHeaderSlot } from "../../shared/components/header-slot";
import { Icon } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import {
  api,
  type KeeperDocumentType,
  type KeeperItem,
  type KeeperPerson,
  type KeeperRecord,
  type KeeperRecordInput,
  type KeeperSnapshot,
} from "../../shared/lib/ipc";
import { withPopoverPinned } from "../../shared/lib/popover-dialog";
import { track } from "../../shared/lib/usage";
import { AddPicker } from "./_components/add-picker";
import { GroupPage } from "./_components/group-page";
import { Home, type PersonFilter, type View } from "./_components/home";
import { ItemEditor } from "./_components/item-editor";
import type { NewPerson } from "./_components/person-select";
import { usePhotoSummaries } from "./_components/photo-strip";
import { RecordDetail } from "./_components/record-detail";
import { RecordEditor } from "./_components/record-editor";
import { ItemRow } from "./_components/rows";
import { SipReminders } from "./_components/sip-reminders";
import { Starters } from "./_components/starters";
import {
  blankRecord,
  docTypeLabel,
  documentSpec,
  personName,
  recordInput,
  recordName,
} from "./_lib/documents";
import { groupDocuments, groupItems, groupName, itemGroupName } from "./_lib/groups";
import { type I18nKey, id, todayKeeperDate } from "./_lib/shared";
import {
  applyTemplate,
  blankItem,
  REMINDER_TEMPLATES,
  type ReminderTemplate,
} from "./_lib/templates";

/** Keeper's own navigation: a small stack, so back always means "the screen I
 * came from" — the add picker, a document reached through a link, the list. */
type Screen =
  | { name: "add"; only?: "documents" | "reminders" }
  /** Every document of one kind; see `_lib/groups`. */
  | { name: "group"; key: string }
  /** Every reminder of one kind. */
  | { name: "itemGroup"; key: string }
  | { name: "sips" }
  | { name: "record"; id: string }
  | { name: "editRecord"; draft: KeeperRecordInput; newPerson: NewPerson | null }
  | { name: "editItem"; draft: KeeperItem; newPerson: NewPerson | null };

export function Keeper() {
  const { t } = useSettings();
  const navigate = useNavigate();
  const { search: linkedSearch } = useLocation();
  const linked = new URLSearchParams(linkedSearch);
  const [data, setData] = useState<KeeperSnapshot>({ people: [], items: [], records: [] });
  const [stack, setStack] = useState<Screen[]>(() =>
    linked.get("section") === "sips" ? [{ name: "sips" }] : [],
  );
  const [view, setView] = useState<View>(() =>
    linked.get("view") === "reminders" ? "reminders" : "documents",
  );
  const [person, setPerson] = useState<PersonFilter>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .keeperSnapshot()
      .then(setData)
      .catch(() => setError(t("keeper.error-load")));
  }, [t]);
  const { data: sipData } = useSWR("sip-statuses", () => api.sipStatuses());
  const sips = sipData ?? [];

  const screen = stack.at(-1) ?? null;
  const itemPhotos = usePhotoSummaries("item");
  const push = (next: Screen) => setStack((current) => [...current, next]);
  const back = () =>
    setStack((current) => {
      // Leaving a form that was never saved: its photos have nothing to
      // belong to.
      const top = current.at(-1);
      if (top?.name === "editRecord" && !top.draft.createdAt) {
        api.discardKeeperAttachments("record", top.draft.id).catch(() => {});
      } else if (top?.name === "editItem" && !top.draft.createdAt) {
        api.discardKeeperAttachments("item", top.draft.id).catch(() => {});
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

  const saveItem = async (draft: KeeperItem, newPerson: NewPerson | null) => {
    const personId = await ownerOf(draft.personId, newPerson);
    if (personId === undefined) return;
    if (await run(api.saveKeeperItem({ ...draft, personId }), "keeper.error-save")) {
      track("action.keeper-save");
      setStack([]);
    }
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
                  : screen.name === "sips"
                    ? t("keeper.sip.title")
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

  const startDocument = (type: KeeperDocumentType, owner: string | null) =>
    push({ name: "editRecord", draft: blankRecord(type, owner), newPerson: null });
  const startReminder = async (template: ReminderTemplate | null, owner: string | null) => {
    const item = {
      ...blankItem(await todayKeeperDate().catch(() => null)),
      personId: owner,
    };
    push({
      name: "editItem",
      draft: template ? applyTemplate(item, template) : item,
      newPerson: null,
    });
  };

  const pickerFor = (owner: string | null, only?: "documents" | "reminders") => (
    <AddPicker
      only={only}
      onDocument={(type) => startDocument(type, owner)}
      onReminder={(template) => startReminder(template, owner)}
      onSip={() => navigate("/bazar?tab=stocks&view=funds&setup=sip")}
      t={t}
    />
  );

  // Adding is always one tap away on the home screen, whatever is below it.
  const onHome = screen === null;
  const addButton = useMemo(
    () =>
      onHome ? (
        <button
          type="button"
          onClick={() => setStack((current) => [...current, { name: "add" }])}
          className="keeper-add-btn"
        >
          <Icon name="plus" className="size-3" />
          {t("keeper.add")}
        </button>
      ) : null,
    [onHome, t],
  );
  useHeaderSlot(addButton);

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
              photos={itemPhotos.get(item.id)}
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
  } else if (screen?.name === "sips") {
    body = (
      <SipReminders
        sips={sips}
        onOpen={(symbol) =>
          navigate(`/bazar?tab=stocks&view=funds&fund=${encodeURIComponent(symbol)}`)
        }
        onAdd={() => navigate("/bazar?tab=stocks&view=funds&setup=sip")}
        t={t}
      />
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
  } else if (data.records.length === 0 && data.items.length === 0 && sips.length === 0) {
    // Nothing kept yet: a welcome and three one-tap starts, with the full
    // picker behind "See all types" and the header's Add.
    body = (
      <Starters
        onDocument={(type) => startDocument(type, defaultPerson)}
        onReminder={(template) => startReminder(template, defaultPerson)}
        onSeeAll={() => push({ name: "add" })}
        t={t}
      />
    );
  } else {
    body = (
      <Home
        data={data}
        sips={sips}
        view={view}
        onView={setView}
        person={person}
        onPerson={setPerson}
        onAdd={(only) => push({ name: "add", only })}
        picker={(only) => pickerFor(defaultPerson, only)}
        onOpenGroup={(key) => push({ name: "group", key })}
        onOpenItemGroup={(key) => push({ name: "itemGroup", key })}
        onOpenRecord={(recordId) => push({ name: "record", id: recordId })}
        onOpenItem={(item) => push({ name: "editItem", draft: item, newPerson: null })}
        onOpenSips={() => push({ name: "sips" })}
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
