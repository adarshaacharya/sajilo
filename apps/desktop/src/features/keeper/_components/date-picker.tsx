import { useEffect, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { MonthGrid } from "../../../shared/components/month-grid";
import { api, type CalendarMonth, type KeeperDate } from "../../../shared/lib/ipc";
import { formatBs, formatDate, type TFn } from "../_lib/shared";

/**
 * One row per date: the label, and the date itself as the control. Tapping it
 * opens the same BS-native `MonthGrid` the dashboard browses with, so picking
 * a date feels like the rest of the app, not a form. Both calendars are shown
 * once a date is set — there is nothing to switch.
 *
 * `optional` dates (a document's issue date) start as "Add date" and can be
 * cleared; a required one (a reminder's due date) always has a value.
 */
export function DateField({
  label,
  value,
  onChange,
  optional = false,
  defaultOpen = false,
  t,
}: {
  label: string;
  value: KeeperDate | null;
  onChange: (value: KeeperDate | null) => void;
  optional?: boolean;
  /** Opens straight onto the calendar, for a prompt that exists only to pick
   * a date ("renewed until…"). */
  defaultOpen?: boolean;
  t: TFn;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <div className="flex min-h-7 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-text-secondary">{label}</span>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-right text-[11px] transition-colors hover:bg-surface-hover ${value ? "" : "font-medium text-accent-mark"}`}
        >
          {value ? (
            <span className="tabular-nums">
              {formatDate(value.ad)}
              <span className="ml-1.5 text-[10px] text-text-muted">{formatBs(value)}</span>
            </span>
          ) : (
            t("keeper.add-date")
          )}
          <Icon name="upcoming" className="size-3 text-text-muted" />
        </button>
        {optional && value && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            aria-label={`${t("keeper.clear")} ${label}`}
            className="icon-btn size-5 shrink-0 text-text-muted hover:text-text"
          >
            <span className="text-[14px] leading-none">×</span>
          </button>
        )}
      </div>
      {open && (
        <Calendar
          value={value}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
          t={t}
        />
      )}
    </div>
  );
}

function Calendar({
  value,
  onSelect,
  t,
}: {
  value: KeeperDate | null;
  onSelect: (date: KeeperDate) => void;
  t: TFn;
}) {
  const [cursor, setCursor] = useState<{ year: number; month: number } | null>(
    value ? { year: value.bs.year, month: value.bs.month } : null,
  );
  const [grid, setGrid] = useState<CalendarMonth | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = (year: number, month: number) =>
      api
        .monthGrid(year, month)
        .then((next) => {
          if (!cancelled) setGrid(next);
        })
        .catch(() => {});
    if (cursor) {
      load(cursor.year, cursor.month);
    } else {
      api
        .today()
        .then((today) => {
          if (!cancelled) setCursor({ year: today.nepali.year, month: today.nepali.month });
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [cursor]);

  const step = (offset: number) => {
    if (!cursor) return;
    api
      .shiftMonth(cursor.year, cursor.month, offset)
      .then(setCursor)
      .catch(() => {});
  };

  return (
    <div className="mt-1 space-y-1.5 rounded-md border border-divider p-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={t("calendar.previous-month")}
          onClick={() => step(-1)}
          className="icon-btn size-6"
        >
          <span className="text-[13px] leading-none">‹</span>
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-[11px] font-semibold text-text-secondary">
          {grid?.title ?? ""}
        </span>
        <button
          type="button"
          aria-label={t("calendar.next-month")}
          onClick={() => step(1)}
          className="icon-btn size-6"
        >
          <span className="text-[13px] leading-none">›</span>
        </button>
      </div>
      {grid && (
        <MonthGrid
          month={grid}
          onSelect={(day) => {
            if (!day.date) return;
            api
              .resolveKeeperDate({ calendar: "bs", ...day.date })
              .then((date) => date && onSelect(date))
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
