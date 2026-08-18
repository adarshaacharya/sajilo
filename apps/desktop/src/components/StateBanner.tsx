import type { ReactNode } from "react";
import { useSettings } from "../lib/settings";

/**
 * Renders the honest states a remote module can be in.
 *
 * A remote module must never silently show nothing: it shows fresh data,
 * clearly labelled stale data, or an explicit unavailable/failed state. This
 * component is where those last three are drawn, so no screen invents its own
 * wording for them.
 */
export type LoadStatus =
  | { status: "loading" }
  | { status: "fresh" }
  | { status: "stale"; since?: string }
  | { status: "unavailable" }
  | { status: "failed"; message: string };

export function StateBanner({
  state,
  onRetry,
  children,
}: {
  state: LoadStatus;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  const { t } = useSettings();

  if (state.status === "fresh") return <>{children}</>;

  if (state.status === "loading") {
    return <p className="py-2 text-text-muted">…</p>;
  }

  // Stale still shows the data — a labelled old number is far more use than a
  // blank card.
  if (state.status === "stale") {
    return (
      <>
        <p className="mb-2 rounded-xl border border-border bg-surface px-2 py-1 text-[11px] text-text-muted">
          {state.since ? `${t("state.stale-since")} ${state.since}` : t("state.stale")}
        </p>
        {children}
      </>
    );
  }

  return (
    <div className="py-2">
      <p className="text-text-secondary">
        {state.status === "unavailable" ? t("state.not-yet") : state.message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-xl border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-hover hover:text-text"
        >
          {t("action.retry")}
        </button>
      )}
    </div>
  );
}
