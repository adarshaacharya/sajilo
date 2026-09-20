import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { NepaliDate } from "../../types/api/NepaliDate";
import { useSettings } from "../context/settings-context";
import { api, type CalendarMonth } from "../lib/ipc";
import { digits } from "../lib/numerals";
import { CONTROL, CONTROL_LABEL } from "./control";
import { Icon } from "./icon";
import { MonthGrid } from "./month-grid";
import { Select } from "./select";

/** Bikram Sambat month numbers; their names come from the engine. */
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Gregorian day arithmetic only — every BS reading still comes from Rust. */
function shiftIsoDays(isoDate: string, days: number): string {
  const at = new Date(`${isoDate}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/**
 * A Bikram Sambat date field.
 *
 * `<input type="date">` hands the job to the webview, which means three
 * different controls across macOS, Windows and Linux — all of them Gregorian,
 * none of them styleable, and WebKitGTK may offer no picker at all. This is
 * the app's own month grid instead: the same one the Today tab draws, fed by
 * the same commands, so the calendar still lives entirely in `sajilo-core`.
 *
 * BS leads and the Gregorian date is the small print, which is the way round
 * the rest of Sajilo reads.
 */
export function BsDateField({
  label,
  value,
  onChange,
  latest,
}: {
  label: string;
  /** Gregorian ISO date, `YYYY-MM-DD` — the wire format everywhere else. */
  value: string;
  onChange: (isoDate: string) => void;
  /** The last selectable day, as a BS date. Later days are shown but dimmed. */
  latest?: NepaliDate | null;
}) {
  const { numerals, t } = useSettings();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<NepaliDate | null>(null);
  const [selectedName, setSelectedName] = useState("");
  const [cursor, setCursor] = useState<NepaliDate | null>(null);
  const [month, setMonth] = useState<CalendarMonth | null>(null);
  const [focus, setFocus] = useState<NepaliDate | null>(null);
  const [focusIso, setFocusIso] = useState("");
  const [latestIso, setLatestIso] = useState("");
  const [monthNames, setMonthNames] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // The BS reading of whatever Gregorian date the form holds.
  useEffect(() => {
    if (!value) return;
    const [year, month_, day] = value.split("-").map(Number);
    if (year == null || month_ == null || day == null) return;
    let cancelled = false;
    api
      .adToBs(year, month_, day)
      .then((conversion) => {
        if (cancelled) return;
        setSelected(conversion.nepali);
        setSelectedName(conversion.nepaliMonthName);
      })
      .catch(() => {
        if (!cancelled) setSelected(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  useEffect(() => {
    if (!latest) return;
    let cancelled = false;
    api
      .bsToAd(latest.year, latest.month, latest.day)
      .then((conversion) => {
        if (!cancelled) setLatestIso(conversion.gregorian);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [latest]);

  // Month names belong to the engine, so they are read from it rather than
  // kept as a second copy here. Any year answers for all of them.
  useEffect(() => {
    if (!open || monthNames.length > 0 || !cursor) return;
    let cancelled = false;
    Promise.all(MONTHS.map((month_) => api.bsToAd(cursor.year, month_, 1)))
      .then((conversions) => {
        if (!cancelled) setMonthNames(conversions.map((one) => one.nepaliMonthName));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, cursor, monthNames.length]);

  useEffect(() => {
    if (!open || years.length > 0) return;
    let cancelled = false;
    api
      .supportedRange()
      .then((range) => {
        if (cancelled) return;
        const list: number[] = [];
        for (let year = range.firstYear; year <= range.lastYear; year += 1) list.push(year);
        setYears(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, years.length]);

  useEffect(() => {
    if (!cursor) return;
    let cancelled = false;
    api
      .monthGrid(cursor.year, cursor.month)
      .then((grid) => {
        if (!cancelled) setMonth(grid);
      })
      .catch(() => {
        if (!cancelled) setMonth(null);
      });
    return () => {
      cancelled = true;
    };
  }, [cursor]);

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    // Bound to the document rather than the panel: opening the picker leaves
    // the keyboard on the trigger, so a handler on the panel alone would never
    // hear the first arrow press. The month and year dropdowns keep theirs.
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        return;
      }
      const days = steps[event.key];
      if (days == null) return;
      if ((event.target as HTMLElement | null)?.tagName === "SELECT") return;
      event.preventDefault();
      mover.current(days);
    };
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  /**
   * Arrow keys walk the grid a day or a week at a time. The step is taken on
   * the Gregorian date — ordinary day arithmetic — and handed straight back to
   * the engine, which is what decides where that lands in Bikram Sambat and
   * therefore handles month lengths and year ends for free.
   */
  const moveFocus = (days: number) => {
    const from = focusIso || value;
    if (!from) return;
    const next = shiftIsoDays(from, days);
    if (latestIso && next > latestIso) return;
    setFocusIso(next);
    const [year, month_, day] = next.split("-").map(Number);
    if (year == null || month_ == null || day == null) return;
    api
      .adToBs(year, month_, day)
      .then((conversion) => {
        setFocus(conversion.nepali);
        setCursor((current) =>
          current &&
          current.year === conversion.nepali.year &&
          current.month === conversion.nepali.month
            ? current
            : conversion.nepali,
        );
      })
      .catch(() => {});
  };

  const mover = useRef(moveFocus);
  mover.current = moveFocus;

  const step = (offset: number) => {
    if (!cursor) return;
    api
      .shiftMonth(cursor.year, cursor.month, offset)
      .then((next) => setCursor(next))
      .catch(() => {});
  };

  const pick = (date: NepaliDate) => {
    api
      .bsToAd(date.year, date.month, date.day)
      .then((conversion) => {
        onChange(conversion.gregorian);
        close();
      })
      .catch(() => {});
  };

  const jumpToToday = () => {
    api
      .today()
      .then((today) => {
        setCursor(today.nepali);
        onChange(today.gregorian);
        close();
      })
      .catch(() => {});
  };

  const bsText = selected
    ? `${digits(selected.day, numerals)} ${selectedName} ${digits(selected.year, numerals)}`
    : "—";

  return (
    <div className="relative" ref={wrapper}>
      <span className={CONTROL_LABEL}>{label}</span>
      <button
        type="button"
        ref={trigger}
        onClick={() => {
          setCursor(selected);
          setFocus(selected);
          setFocusIso(value);
          setOpen((current) => !current);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={`${CONTROL} flex cursor-pointer items-center gap-1.5 text-left hover:bg-surface-hover`}
      >
        <Icon name="calendar" className="size-2.5 shrink-0 text-text-muted" />
        <span className="min-w-0 flex-1 truncate">{bsText}</span>
        <span className="shrink-0 text-[10px] text-text-muted tabular-nums">
          {formatGregorian(value)}
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={label}
          className="surface-card absolute top-full right-0 left-0 z-20 mt-1 p-2"
        >
          <div className="mb-1.5 flex items-center gap-1">
            <button
              type="button"
              aria-label={t("calendar.previous-month")}
              onClick={() => step(-1)}
              className="icon-btn size-6"
            >
              <span className="text-[14px] leading-none">‹</span>
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <Select
                ariaLabel={t("calendar.month")}
                value={cursor ? String(cursor.month) : ""}
                onChange={(next) =>
                  setCursor((current) =>
                    current ? { ...current, month: Number(next), day: 1 } : current,
                  )
                }
                options={MONTHS.map((month_) => ({
                  id: String(month_),
                  label: monthNames[month_ - 1] ?? String(month_),
                }))}
              />
              <Select
                ariaLabel={t("calendar.year")}
                value={cursor ? String(cursor.year) : ""}
                onChange={(next) =>
                  setCursor((current) =>
                    current ? { ...current, year: Number(next), day: 1 } : current,
                  )
                }
                options={years.map((year) => ({
                  id: String(year),
                  label: digits(year, numerals),
                }))}
              />
            </div>
            <button
              type="button"
              aria-label={t("calendar.next-month")}
              onClick={() => step(1)}
              className="icon-btn size-6"
            >
              <span className="text-[14px] leading-none">›</span>
            </button>
          </div>

          {month ? (
            <MonthGrid
              month={month}
              selected={selected}
              focused={focus}
              isDisabled={(day) => (day.date && latest ? isAfter(day.date, latest) : false)}
              onSelect={(day) => day.date && pick(day.date)}
            />
          ) : (
            <div className="h-[220px]" />
          )}

          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={jumpToToday}
              className="btn-ghost text-[10px] font-medium text-accent-mark"
            >
              {t("stocks.portfolio-today")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Ordering two dates the engine produced — no calendar arithmetic here. */
function isAfter(date: NepaliDate, limit: NepaliDate): boolean {
  if (date.year !== limit.year) return date.year > limit.year;
  if (date.month !== limit.month) return date.month > limit.month;
  return date.day > limit.day;
}

function formatGregorian(isoDate: string): string {
  if (!isoDate) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${isoDate}T00:00:00`));
}
