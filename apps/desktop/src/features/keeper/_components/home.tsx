import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { ScrollRow } from "../../../shared/components/scroll-row";
import { Segmented } from "../../../shared/components/segmented";
import type {
  KeeperDate,
  KeeperItem,
  KeeperPerson,
  KeeperRecord,
  KeeperSnapshot,
} from "../../../shared/lib/ipc";
import type { SipStatus } from "../../../types/api/SipStatus";
import { documentSpec, personName, recordName } from "../_lib/documents";
import { groupDocuments, groupItems, groupName, itemGroupName } from "../_lib/groups";
import { DOCUMENT_ICONS } from "../_lib/icons";
import { daysUntil, dueLabel, dueTone, type TFn } from "../_lib/shared";
import { type Upcoming, upcomingOf } from "../_lib/upcoming";
import { DueTile, ItemGroupRow, TickButton } from "./rows";
import { SipGroupRow } from "./sip-reminders";

export type View = "documents" | "reminders";
/** `null` is everyone; `""` is the user / household (no person). */
export type PersonFilter = string | null;

/** How far ahead each kind starts counting down: renewing a passport takes
 * weeks, paying a bill takes a minute. Matches `upcomingOf`. */
const RUNWAY = { record: 60, item: 14 };

/** One urgency scale as a colour: late, close, or comfortably ahead. */
function toneOf(days: number | null, close: number): string {
  if (days === null) return "var(--color-text-muted)";
  if (days < 0) return "var(--color-holiday)";
  if (days <= close) return "var(--color-accent-mark)";
  return "var(--color-positive)";
}

const toned = (tone: string) => ({ "--tone": tone }) as CSSProperties;

export function Home({
  data,
  sips,
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
  onOpenSips,
  onToggleItem,
  t,
}: {
  data: KeeperSnapshot;
  sips: readonly SipStatus[];
  view: View;
  onView: (view: View) => void;
  person: PersonFilter;
  onPerson: (person: PersonFilter) => void;
  onAdd: (only: View) => void;
  /** The add choices for one tab, shown in place when that tab is empty. */
  picker: (only: View) => ReactNode;
  onOpenGroup: (key: string) => void;
  onOpenItemGroup: (key: string) => void;
  onOpenRecord: (id: string) => void;
  onOpenItem: (item: KeeperItem) => void;
  onOpenSips: () => void;
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
  const visibleSips = person === null || person === "" ? sips : [];
  const upcoming = upcomingOf(records, items);
  const [next, ...rest] = upcoming;
  const open = (entry: Upcoming) =>
    entry.record ? onOpenRecord(entry.record.id) : entry.item && onOpenItem(entry.item);

  return (
    <>
      {data.people.length > 0 && (
        <PeopleRow
          people={data.people}
          late={upcomingOf(data.records, data.items).filter((entry) => entry.days < 0)}
          person={person}
          onPerson={onPerson}
          t={t}
        />
      )}

      {next && (
        <NextUp
          entry={next}
          owner={nameOf(next.record?.personId ?? next.item?.personId ?? null)}
          onOpen={() => open(next)}
          onToggleItem={onToggleItem}
          t={t}
        />
      )}

      {rest.length > 0 && (
        <section aria-label={t("keeper.attention")} className="space-y-1.5">
          <h2 className="px-0.5 text-[11px] font-semibold text-text-secondary">
            {t("keeper.attention")}
          </h2>
          <div className="surface-card px-3">
            {rest.slice(0, 5).map((entry) => {
              const item = entry.item;
              const date = entry.record?.expiryDate ?? item?.dueDate;
              return (
                <div
                  key={entry.key}
                  className="flex items-center gap-2.5 border-b border-divider py-2 last:border-0"
                >
                  <button
                    type="button"
                    onClick={() => open(entry)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    {date && <DueTile date={date as KeeperDate} days={entry.days} />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium">
                        {entry.record ? recordName(t, entry.record) : item?.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-text-muted">
                        {nameOf(entry.record?.personId ?? item?.personId ?? null)}
                        {nameOf(entry.record?.personId ?? item?.personId ?? null) && " · "}
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
          <Wallet
            records={records}
            people={data.people}
            onOpen={onOpenRecord}
            onOpenGroup={onOpenGroup}
            onAdd={() => onAdd("documents")}
            t={t}
          />
        )
      ) : items.length === 0 && visibleSips.length === 0 ? (
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
            sips={visibleSips.filter((sip) =>
              `${sip.name} ${sip.symbol}`.toLowerCase().includes(search.toLowerCase()),
            )}
            nameOf={nameOf}
            onOpenGroup={onOpenItemGroup}
            onOpenSips={onOpenSips}
            onAdd={() => onAdd("reminders")}
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

/** Whose things to show, as faces: everyone, me, then family. A red count
 * on a face says how much of theirs is late before it is opened. */
function PeopleRow({
  people,
  late,
  person,
  onPerson,
  t,
}: {
  people: readonly KeeperPerson[];
  late: readonly Upcoming[];
  person: PersonFilter;
  onPerson: (person: PersonFilter) => void;
  t: TFn;
}) {
  const ownerOf = (entry: Upcoming) => entry.record?.personId ?? entry.item?.personId ?? null;
  const chips: { id: PersonFilter; label: string; mark: string; late: number }[] = [
    { id: null, label: t("keeper.person.everyone"), mark: "", late: late.length },
    {
      id: "",
      label: t("keeper.person.me"),
      mark: Array.from(t("keeper.person.me"))[0] ?? "",
      late: late.filter((entry) => ownerOf(entry) === null).length,
    },
    ...people.map((entry) => ({
      id: entry.id,
      label: entry.name,
      mark: Array.from(entry.name.trim())[0]?.toLocaleUpperCase() ?? "·",
      late: late.filter((item) => ownerOf(item) === entry.id).length,
    })),
  ];

  return (
    <ScrollRow className="-mx-0.5 flex gap-2.5 px-0.5 pt-1 pb-0.5">
      {chips.map((chip) => (
        <button
          key={chip.id ?? "everyone"}
          type="button"
          aria-pressed={person === chip.id}
          onClick={() => onPerson(chip.id)}
          className="keeper-person"
        >
          <span className="keeper-person__face">
            {chip.id === null ? <Icon name="house" className="size-4" /> : chip.mark}
            {chip.late > 0 && (
              <span className="keeper-person__late" aria-hidden="true">
                {chip.late}
              </span>
            )}
          </span>
          <span className="keeper-person__name">{chip.label}</span>
        </button>
      ))}
    </ScrollRow>
  );
}

/** The one thing to do next, large: how long is left, how much of its
 * runway is used up, and the button that settles it. */
function NextUp({
  entry,
  owner,
  onOpen,
  onToggleItem,
  t,
}: {
  entry: Upcoming;
  owner: string | undefined;
  onOpen: () => void;
  onToggleItem: (item: KeeperItem) => void;
  t: TFn;
}) {
  const { record, item, days } = entry;
  const runway = record ? RUNWAY.record : RUNWAY.item;
  const tone = toneOf(days, record ? 30 : 3);
  const used = days < 0 ? 1 : Math.min(Math.max(1 - days / runway, 0.04), 1);
  const date = (record?.expiryDate ?? item?.dueDate) as KeeperDate | null;
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(false), 1100);
    return () => clearTimeout(id);
  }, [flash]);

  const settle = () => {
    if (!item) return;
    setFlash(true);
    onToggleItem(item);
  };

  return (
    <section
      aria-label={t("keeper.next-up")}
      className="surface-card relative space-y-2.5 overflow-hidden p-3"
      style={toned(tone)}
    >
      <p className="text-[11px] font-semibold text-text-secondary">{t("keeper.next-up")}</p>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 text-left">
        <span className="keeper-due-big">
          <b>{days === 0 ? "!" : Math.abs(days)}</b>
          <span>
            {days === 0
              ? t("keeper.today")
              : days < 0
                ? t("keeper.days-late-long")
                : t("keeper.days-left")}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-tight">
            {record ? recordName(t, record) : item?.title}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-text-muted">
            {[owner, date ? `${date.bs.day} ${date.bs.monthName}` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      </button>
      <div className="h-[5px] overflow-hidden rounded-full bg-[color:var(--color-divider)]">
        <div
          className="keeper-runway h-full rounded-full"
          style={{ width: `${Math.round(used * 100)}%` }}
        />
      </div>
      <div className="flex gap-2">
        {item ? (
          <>
            <button type="button" onClick={settle} className="keeper-pill keeper-pill--primary">
              <Icon name="checkmark" className="size-3" />
              {item.recurrence !== "none" ? t("keeper.mark-paid") : t("keeper.action.done")}
            </button>
            <button type="button" onClick={onOpen} className="keeper-pill">
              {t("keeper.details")}
            </button>
          </>
        ) : (
          <button type="button" onClick={onOpen} className="keeper-pill keeper-pill--primary">
            {t("keeper.how-to-renew")}
          </button>
        )}
      </div>
      <div className={`keeper-flash ${flash ? "keeper-flash--on" : ""}`} aria-live="polite">
        {flash && (
          <>
            <Icon name="checkmark" className="size-4" />
            {t("keeper.done")}
          </>
        )}
      </div>
    </section>
  );
}

/** Documents as cards, two across: what it is, whether it is still good,
 * and whose. The coloured edge is the same urgency scale as everything else. */
function Wallet({
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
  return (
    <div className="grid grid-cols-2 gap-2">
      {groupDocuments(records).map((group) => {
        const [first] = group.records;
        const dated = group.records.find(
          (record) => record.expiryDate && documentSpec(record).kind !== "record",
        );
        const days = dated?.expiryDate ? daysUntil(dated.expiryDate.ad) : null;
        const status =
          days === null
            ? t("keeper.hint.on-file")
            : days <= RUNWAY.record
              ? dueLabel(t, days)
              : t("keeper.status.valid");
        const owners = [
          ...new Set(group.records.map((record) => personName(t, people, record.personId))),
        ];
        const count = group.records.length;
        return (
          <button
            key={group.key}
            type="button"
            onClick={() => (count === 1 && first ? onOpen(first.id) : onOpenGroup(group.key))}
            className="keeper-doc surface-card"
            style={toned(toneOf(days, 30))}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="keeper-doc__icon">
                <Icon name={DOCUMENT_ICONS[group.type]} className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">
                {groupName(t, group)}
              </span>
              {count > 1 && (
                <span className="shrink-0 text-[10px] text-text-muted tabular-nums">×{count}</span>
              )}
            </span>
            <span className="keeper-doc__chip">{status}</span>
            <span className="truncate text-[10px] text-text-muted">{owners.join(" · ")}</span>
          </button>
        );
      })}
      <button type="button" onClick={onAdd} className="keeper-doc keeper-doc--add">
        <Icon name="plus" className="size-3.5" />
        {t("keeper.add-document")}
      </button>
    </div>
  );
}

function ReminderList({
  items,
  sips,
  nameOf,
  onOpenGroup,
  onOpenSips,
  onAdd,
  t,
}: {
  items: readonly KeeperItem[];
  sips: readonly SipStatus[];
  nameOf: (personId: string | null) => string | undefined;
  onOpenGroup: (key: string) => void;
  onOpenSips: () => void;
  onAdd: () => void;
  t: TFn;
}) {
  if (items.length === 0 && sips.length === 0) {
    return (
      <section className="surface-card px-4 py-8 text-center">
        <Icon name="keeper" className="mx-auto size-6 text-text-muted" />
        <p className="mt-2 text-[12px] font-medium">{t("keeper.empty-search-title")}</p>
        <p className="mt-1 text-[10px] text-text-muted">{t("keeper.empty-search-body")}</p>
      </section>
    );
  }
  // One row per kind, each opening its page: that's where the tick boxes and
  // "Add another" live, whether the kind holds one reminder or five.
  return (
    <section className="surface-card px-3">
      {sips.length > 0 && <SipGroupRow sips={sips} onOpen={onOpenSips} t={t} />}
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
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center gap-2.5 py-2.5 text-left text-[11px] font-medium text-accent-mark"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[5px] border border-dashed border-[color:color-mix(in_srgb,var(--color-accent-mark)_45%,transparent)]">
          <Icon name="plus" className="size-3" />
        </span>
        {t("keeper.add-reminder")}
      </button>
    </section>
  );
}
