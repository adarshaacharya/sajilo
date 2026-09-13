import { Icon } from "../../../shared/components/icon";
import { SkeletonBlock } from "../../../shared/components/skeleton";
import { useSettings } from "../../../shared/context/settings-context";
import { loadedValue } from "../../../shared/lib/load-state";
import type { IpoSnapshot } from "../../../types/api/IpoSnapshot";
import type { LoadState } from "../../../types/api/LoadState";
import { sourceStamp } from "../_lib/format";
import type { IssueGroups } from "../_lib/ipo";
import { IpoRow } from "./ipo-row";

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

      <IpoCardBody state={state} onRetry={onRetry}>
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
        {state?.status === "stale" && snapshot && (
          <p className="mt-1.5 flex items-center gap-1 text-[10px] text-text-secondary">
            <Icon name="clock" className="size-3 shrink-0 text-[color:var(--color-accent-mark)]" />
            {t("state.stale-since")} {sourceStamp(snapshot.freshness)}
          </p>
        )}
      </IpoCardBody>
    </section>
  );
}

/**
 * The card-sized version of `StateBanner`. The full banner is drawn for a
 * whole screen; inside one section of the market view it would push the
 * index and watchlist off the panel over a secondary source.
 */
function IpoCardBody({
  state,
  onRetry,
  children,
}: {
  state: LoadState<IpoSnapshot> | undefined;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  const { t } = useSettings();

  if (!state || state.status === "loading") {
    return (
      <div role="status" aria-busy="true" aria-label={t("state.loading")} className="mt-1.5">
        <SkeletonBlock className="h-3 w-2/5" />
        <SkeletonBlock className="mt-1.5 h-2 w-3/5" />
      </div>
    );
  }

  if (state.status === "failed" || state.status === "unavailable") {
    const failed = state.status === "failed";
    if (failed) console.warn("[Sajilo] IPO list unavailable:", state.value);
    return (
      <div role={failed ? "alert" : "status"} className="mt-0.5 flex items-center gap-2">
        <Icon
          name={failed ? "warning" : "info"}
          className={`size-3.5 shrink-0 ${failed ? "text-[color:var(--color-negative)]" : "text-text-secondary"}`}
        />
        <p className="min-w-0 flex-1 text-[11px] text-text-secondary">
          {failed ? t("stocks.ipo-failed") : t("state.not-yet")}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="btn-ghost -mr-1.5 shrink-0 text-[11px] text-[color:var(--color-accent-mark)]"
        >
          {t("action.retry")}
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
