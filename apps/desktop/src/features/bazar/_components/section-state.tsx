import type { ReactNode } from "react";
import { Icon } from "../../../shared/components/icon";
import { SkeletonBlock } from "../../../shared/components/skeleton";
import { useSettings } from "../../../shared/context/settings-context";
import { loadedValue } from "../../../shared/lib/load-state";
import type { Freshness } from "../../../types/api/Freshness";
import type { LoadState } from "../../../types/api/LoadState";
import { sourceStamp } from "../_lib/format";

/**
 * The card-sized version of `StateBanner`, for a secondary source inside the
 * market view. The full banner is drawn for a whole screen; inside one section
 * it would push the index and watchlist off the panel over a side feed.
 */
export function SectionState<T extends { freshness: Freshness }>({
  state,
  failedLabel,
  onRetry,
  children,
}: {
  state: LoadState<T> | undefined;
  failedLabel: string;
  onRetry: () => void;
  children: ReactNode;
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
    if (failed) console.warn(`[Sajilo] ${failedLabel}:`, state.value);
    return (
      <div role={failed ? "alert" : "status"} className="mt-0.5 flex items-center gap-2">
        <Icon
          name={failed ? "warning" : "info"}
          className={`size-3.5 shrink-0 ${failed ? "text-[color:var(--color-negative)]" : "text-text-secondary"}`}
        />
        <p className="min-w-0 flex-1 text-[11px] text-text-secondary">
          {failed ? failedLabel : t("state.not-yet")}
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

  const snapshot = loadedValue(state);
  return (
    <>
      {children}
      {state.status === "stale" && snapshot && (
        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-text-secondary">
          <Icon name="clock" className="size-3 shrink-0 text-[color:var(--color-accent-mark)]" />
          {t("state.stale-since")} {sourceStamp(snapshot.freshness)}
        </p>
      )}
    </>
  );
}
