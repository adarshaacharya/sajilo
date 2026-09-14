import { useSettings } from "../../../shared/context/settings-context";
import { loadedValue } from "../../../shared/lib/load-state";
import type { IpoSnapshot } from "../../../types/api/IpoSnapshot";
import type { LoadState } from "../../../types/api/LoadState";
import type { IssueGroups } from "../_lib/ipo";
import { IpoRow } from "./ipo-row";
import { SectionState } from "./section-state";

/** Rows on the market view; the rest is one tap away in the full list. */
const PREVIEW = 3;

/**
 * The market view's IPO section.
 *
 * It sits beside the NEPSE card rather than behind a second tab bar: an open
 * issue is a deadline, and a deadline hidden one tap away is one people miss.
 * When nothing is open it collapses to a single line so it costs the market
 * view almost nothing.
 */
export function IpoCard({
  state,
  groups,
  onOpenIssue,
  onOpenAll,
  onRetry,
}: {
  state: LoadState<IpoSnapshot> | undefined;
  groups: IssueGroups | undefined;
  onOpenIssue: (key: string) => void;
  onOpenAll: () => void;
  onRetry: () => void;
}) {
  const { t } = useSettings();
  const snapshot = loadedValue(state);
  const active = groups ? [...groups.open, ...groups.upcoming] : [];
  const shown = active.slice(0, PREVIEW);
  const openCount = groups?.open.length ?? 0;
  const total = groups?.total ?? 0;

  return (
    <section className="surface-card p-2.5" aria-label={t("stocks.ipos")}>
      <div className="flex min-h-[22px] items-center gap-1.5">
        <p className="text-[11px] font-semibold text-text-secondary">{t("stocks.ipos")}</p>
        {openCount > 0 && (
          <span className="rounded-md bg-[color-mix(in_srgb,var(--color-accent-mark)_14%,transparent)] px-1.5 text-[10px] font-medium leading-4 tabular-nums text-[color:var(--color-accent-mark)]">
            {t("stocks.ipo-open-count").replace("{n}", String(openCount))}
          </span>
        )}
        {total > 0 && (
          <button
            type="button"
            onClick={onOpenAll}
            className="btn-ghost -mr-1.5 ml-auto flex items-center gap-1 text-[11px]"
          >
            {t("stocks.ipo-all")}
            <span className="tabular-nums text-text-muted">{total}</span>
            <span aria-hidden>›</span>
          </button>
        )}
      </div>

      <SectionState state={state} failedLabel={t("stocks.ipo-failed")} onRetry={onRetry}>
        {snapshot &&
          (shown.length === 0 ? (
            <p className="mt-0.5 text-[11px] text-text-secondary">{t("stocks.no-open-ipos")}</p>
          ) : (
            <div className="mt-0.5">
              {shown.map((entry) => (
                <IpoRow key={entry.key} entry={entry} onOpen={() => onOpenIssue(entry.key)} />
              ))}
            </div>
          ))}
      </SectionState>
    </section>
  );
}
