import { Icon } from "../../../shared/components/icon";
import type { KeeperItem, KeeperRecord } from "../../../shared/lib/ipc";
import { recordName, recordSummary } from "../_lib/documents";
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

export function RecordRow({
  record,
  onOpen,
  t,
}: {
  record: KeeperRecord;
  onOpen: () => void;
  t: TFn;
}) {
  const summary = recordSummary(record);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 border-b border-divider py-2.5 text-left last:border-0"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium">{recordName(t, record)}</span>
        {summary && (
          <span className="mt-0.5 block truncate text-[10px] text-text-muted">{summary}</span>
        )}
      </span>
      {record.links.length > 0 && <Icon name="link" className="size-3 shrink-0 text-text-muted" />}
      <RecordDue record={record} t={t} />
    </button>
  );
}
