import { Icon } from "../../../shared/components/icon";
import {
  api,
  type KeeperAttachmentSummary,
  type KeeperDate,
  type KeeperItem,
  type KeeperRecord,
} from "../../../shared/lib/ipc";
import { daysUntil, dueLabel, dueTone, type TFn } from "../_lib/shared";
import { PhotoBadge } from "./photo-strip";
import { RecordDue } from "./record-detail";

export function ItemRow({
  item,
  personName,
  photos,
  onOpen,
  onComplete,
  t,
}: {
  item: KeeperItem;
  personName?: string;
  /** This reminder's photos, when it has any. */
  photos?: KeeperAttachmentSummary;
  onOpen: () => void;
  onComplete: () => void;
  t: TFn;
}) {
  const done = item.status === "completed";
  const days = item.dueDate ? daysUntil(item.dueDate.ad) : null;
  return (
    <div className="flex items-center gap-2.5 border-b border-divider py-2.5 last:border-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        {item.dueDate ? (
          <DueTile date={item.dueDate} days={done ? null : days} />
        ) : (
          <LetterTile text={personName ?? item.title} />
        )}
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[12px] font-medium ${done ? "text-text-muted line-through" : ""}`}
          >
            {item.title}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-text-muted">
            {personName}
            {personName && (done || days !== null) && " · "}
            {done ? (
              <span className="text-positive">{t("keeper.done")}</span>
            ) : (
              days !== null && <span className={dueTone(days)}>{dueLabel(t, days)}</span>
            )}
          </span>
        </span>
      </button>
      {photos && (
        <PhotoBadge
          summary={photos}
          onOpen={() => api.openKeeperViewer("item", item.id, 0).catch(() => {})}
          t={t}
        />
      )}
      <TickButton item={item} onToggle={onComplete} t={t} />
    </div>
  );
}

/** How many papers a kind holds, drawn as a small stack: one sheet for one,
 * up to three offset sheets behind the count for more. */
export function PaperStack({ count, label }: { count: number; label: string }) {
  const sheets = Math.min(count, 3);
  return (
    <span className="relative size-8 shrink-0" role="img" aria-label={label}>
      {sheets >= 3 && (
        <span className="absolute inset-0 translate-x-[4px] -translate-y-[4px] rounded-[5px] border border-divider bg-surface-hover opacity-40" />
      )}
      {sheets >= 2 && (
        <span className="absolute inset-0 translate-x-[2px] -translate-y-[2px] rounded-[5px] border border-divider bg-surface-hover opacity-70" />
      )}
      <span className="absolute inset-0 flex items-center justify-center rounded-[5px] border border-divider bg-surface-hover text-[12px] font-semibold tabular-nums text-accent-mark">
        {count}
      </span>
    </span>
  );
}

/** One kind of paper in the list: how many, whose, and the soonest date any
 * of them needs. */
export function GroupRow({
  name,
  records,
  owners,
  onOpen,
  t,
}: {
  name: string;
  records: readonly KeeperRecord[];
  /** Whose these are, already resolved to names. */
  owners: readonly string[];
  onOpen: () => void;
  t: TFn;
}) {
  const dated = records.find((record) => record.expiryDate);
  const count = records.length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2.5 border-b border-divider py-2.5 text-left last:border-0"
    >
      <PaperStack
        count={count}
        label={t(count === 1 ? "keeper.count.one" : "keeper.count.many").replace(
          "{n}",
          String(count),
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium">{name}</span>
        <span className="mt-0.5 block truncate text-[10px] text-text-muted">
          {[...new Set(owners)].join(" · ")}
        </span>
      </span>
      {count === 1 && records[0] && records[0].links.length > 0 && (
        <Icon name="link" className="size-3 shrink-0 text-text-muted" />
      )}
      {dated && <RecordDue record={dated} t={t} />}
    </button>
  );
}

/** One kind of reminder in the list — every subscription, every electricity
 * bill — with the same stack tile as documents. */
export function ItemGroupRow({
  name,
  items,
  detail,
  onOpen,
  t,
}: {
  name: string;
  items: readonly KeeperItem[];
  /** Already joined: the members' own titles, or whose they are. */
  detail: string;
  onOpen: () => void;
  t: TFn;
}) {
  const next = items.find((item) => item.status !== "completed" && item.dueDate);
  const days = next?.dueDate ? daysUntil(next.dueDate.ad) : null;
  const open = items.filter((item) => item.status !== "completed").length;
  const count = items.length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2.5 border-b border-divider py-2.5 text-left last:border-0"
    >
      <PaperStack
        count={count}
        label={t(count === 1 ? "keeper.count.one-reminder" : "keeper.count.many-reminders").replace(
          "{n}",
          String(count),
        )}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[12px] font-medium ${open === 0 ? "text-text-muted line-through" : ""}`}
        >
          {name}
        </span>
        {detail && (
          <span className="mt-0.5 block truncate text-[10px] text-text-muted">{detail}</span>
        )}
      </span>
      {open === 0 ? (
        <span className="shrink-0 text-[10px] font-medium text-positive">{t("keeper.done")}</span>
      ) : (
        days !== null && (
          <span className={`shrink-0 text-[10px] font-medium tabular-nums ${dueTone(days)}`}>
            {dueLabel(t, days)}
          </span>
        )
      )}
    </button>
  );
}

/** A reminder's tick. On a repeating one it means "this cycle is paid", and
 * the reminder moves on to its next date rather than disappearing. */
export function TickButton({
  item,
  onToggle,
  t,
}: {
  item: KeeperItem;
  onToggle: () => void;
  t: TFn;
}) {
  const done = item.status === "completed";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={
        done
          ? t("keeper.reopen")
          : item.recurrence !== "none" && item.dueDate
            ? t("keeper.mark-paid-next")
            : t("keeper.mark-complete")
      }
      title={
        !done && item.recurrence !== "none" && item.dueDate ? t("keeper.mark-paid-next") : undefined
      }
      className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors ${done ? "border-positive bg-positive text-[#10151a]" : "border-control-border text-transparent hover:border-positive hover:text-positive"}`}
    >
      <Icon name="checkmark" className="size-3" />
    </button>
  );
}

/** A due date as a calendar leaf, in the same tile shape as the list's
 * stacks: the BS day large, the month under it, tinted by how close it is.
 * `days` is null when the thing is done, which drops the tint. */
export function DueTile({ date, days }: { date: KeeperDate; days: number | null }) {
  const tone =
    days === null
      ? "text-text-muted bg-surface-hover"
      : days < 0
        ? "text-holiday bg-[color:color-mix(in_srgb,var(--color-holiday)_12%,transparent)]"
        : days <= 3
          ? "text-accent-mark bg-[color:color-mix(in_srgb,var(--color-accent-mark)_12%,transparent)]"
          : "text-text-secondary bg-surface-hover";
  return (
    <span
      className={`flex size-8 shrink-0 flex-col items-center justify-center rounded-[5px] border border-divider leading-none ${tone}`}
      aria-hidden="true"
    >
      <span className="text-[13px] font-semibold tabular-nums">{date.bs.day}</span>
      <span className="mt-[2px] max-w-full truncate px-0.5 text-[8px] font-medium opacity-80">
        {date.bs.monthName}
      </span>
    </span>
  );
}

/** For something with no date: the first letter of whose it is, or of its
 * name, in the same tile. */
export function LetterTile({ text }: { text: string }) {
  const letter = Array.from(text.trim())[0] ?? "·";
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-[5px] border border-divider bg-surface-hover text-[13px] font-semibold text-text-secondary"
      aria-hidden="true"
    >
      {letter.toLocaleUpperCase()}
    </span>
  );
}
