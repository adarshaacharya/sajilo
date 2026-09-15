import { useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { loadedValue } from "../../../shared/lib/load-state";
import type { BookClosure } from "../../../types/api/BookClosure";
import type { DividendSnapshot } from "../../../types/api/DividendSnapshot";
import type { LoadState } from "../../../types/api/LoadState";
import { daysUntil, issueDate, nepalToday } from "../_lib/ipo";
import { SectionState } from "./section-state";

/** Rows before "All": enough to see what is next without pushing the movers down. */
const PREVIEW = 3;
/** Inside this many days a closure is near enough to call out. */
const SOON_DAYS = 3;

const percent = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

type Row = { closure: BookClosure; days: number; followed: boolean };

/**
 * Dividends whose book closure is still ahead — the one date a holder has to
 * act on. Each row says only what is paid and when; watchlist companies come
 * first so a company the user follows is never hidden behind the preview.
 */
export function DividendCard({
  state,
  followed,
  onOpen,
  onRetry,
}: {
  state: LoadState<DividendSnapshot> | undefined;
  followed: (symbol: string) => boolean;
  onOpen: (symbol: string) => void;
  onRetry: () => void;
}) {
  const { t } = useSettings();
  const [expanded, setExpanded] = useState(false);
  const snapshot = loadedValue(state);
  const today = nepalToday();

  // A cached list can outlive a closure; drop anything that has passed.
  const rows: Row[] = (snapshot?.closures ?? [])
    .flatMap((closure) => {
      const days = daysUntil(closure.bookClosureDate, today);
      return days == null || days < 0
        ? []
        : [{ closure, days, followed: followed(closure.symbol) }];
    })
    .sort((a, b) => Number(b.followed) - Number(a.followed) || a.days - b.days);
  const shown = expanded ? rows : rows.slice(0, PREVIEW);

  return (
    <section className="surface-card p-2.5" aria-label={t("stocks.dividends")}>
      <div className="flex min-h-[22px] items-center gap-1.5">
        <p className="text-[11px] font-semibold text-text-secondary">{t("stocks.dividends")}</p>
        {rows.length > PREVIEW && (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="btn-ghost -mr-1.5 ml-auto flex items-center gap-1 text-[11px]"
          >
            {expanded ? (
              t("stocks.show-less")
            ) : (
              <>
                {t("stocks.ipo-all")}
                <span className="tabular-nums text-text-muted">{rows.length}</span>
                <span aria-hidden>›</span>
              </>
            )}
          </button>
        )}
      </div>

      <SectionState state={state} failedLabel={t("stocks.dividend-failed")} onRetry={onRetry}>
        {snapshot &&
          (shown.length === 0 ? (
            <p className="mt-0.5 text-[11px] text-text-secondary">{t("stocks.no-dividends")}</p>
          ) : (
            <div className="mt-0.5">
              {shown.map((row) => (
                <DividendRow
                  key={`${row.closure.symbol}-${row.closure.bookClosureDate}`}
                  row={row}
                  onOpen={() => onOpen(row.closure.symbol)}
                />
              ))}
            </div>
          ))}
      </SectionState>
    </section>
  );
}

function DividendRow({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const { t, language } = useSettings();
  const { closure, days, followed } = row;

  const payout = [
    closure.bonusPercent > 0
      ? t("stocks.dividend-bonus").replace("{n}", percent.format(closure.bonusPercent))
      : null,
    closure.cashPercent > 0
      ? t("stocks.dividend-cash").replace("{n}", percent.format(closure.cashPercent))
      : null,
  ]
    .filter(Boolean)
    .join(" + ");

  const soon = days <= SOON_DAYS;
  const when =
    days === 0
      ? t("stocks.dividend-closes-today")
      : days === 1
        ? t("stocks.dividend-closes-tomorrow")
        : soon
          ? t("stocks.dividend-closes-in").replace("{n}", String(days))
          : t("stocks.dividend-closes").replace(
              "{date}",
              issueDate(closure.bookClosureDate, language) ?? closure.bookClosureDate,
            );

  return (
    <button
      type="button"
      onClick={onOpen}
      className="row-line flex w-full items-center gap-2 py-2.5 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="truncate text-[13px] font-semibold leading-4 text-text">
            {closure.symbol}
          </span>
          {followed && (
            <Icon
              name="starFill"
              className="size-2.5 shrink-0 text-[color:var(--color-accent-mark)]"
            />
          )}
        </span>
        {closure.companyName && (
          <span className="mt-0.5 block truncate text-[10px] leading-[14px] text-text-muted">
            {closure.companyName}
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-[11px] font-medium leading-4 tabular-nums text-text">{payout}</span>
        <span
          className={`text-[10px] leading-[14px] tabular-nums ${soon ? "font-medium text-[color:var(--color-accent-mark)]" : "text-text-muted"}`}
        >
          {when}
        </span>
      </span>
      <span aria-hidden className="shrink-0 text-[13px] leading-none text-text-muted">
        ›
      </span>
    </button>
  );
}
