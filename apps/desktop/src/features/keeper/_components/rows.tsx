import { Icon } from "../../../shared/components/icon";
import type { KeeperItem, KeeperRecord } from "../../../shared/lib/ipc";
import { daysUntil, dueLabel, dueTone, formatBs, formatDate, type TFn } from "../_lib/shared";
import { RecordDue } from "./record-detail";

export function ItemRow({
  item,
  personName,
  onOpen,
  onComplete,
  t,
}: {
  item: KeeperItem;
  personName?: string;
  onOpen: () => void;
  onComplete: () => void;
  t: TFn;
}) {
  const done = item.status === "completed";
  const days = item.dueDate ? daysUntil(item.dueDate.ad) : null;
  return (
    <article className="border-b border-divider py-2.5 last:border-0">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onComplete}
          aria-label={done ? t("keeper.reopen") : t("keeper.mark-complete")}
          className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors ${done ? "border-positive bg-positive text-[#10151a]" : "border-control-border hover:border-accent-mark"}`}
        >
          {done && <Icon name="checkmark" className="size-3" />}
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={`truncate text-[12px] font-medium ${done ? "text-text-muted line-through" : ""}`}
            >
              {item.title}
            </p>
            {done ? (
              <span className="shrink-0 text-[10px] font-medium text-positive">
                {t("keeper.done")}
              </span>
            ) : (
              days !== null && (
                <span className={`shrink-0 text-[10px] font-medium tabular-nums ${dueTone(days)}`}>
                  {dueLabel(t, days)}
                </span>
              )
            )}
          </div>
          <p className="mt-0.5 truncate text-[10px] text-text-muted">
            {[
              personName,
              item.dueDate && `${formatDate(item.dueDate.ad)} · ${formatBs(item.dueDate)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </button>
      </div>
    </article>
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
