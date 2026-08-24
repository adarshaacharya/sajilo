import type { ReactNode } from "react";
import { useSettings } from "../context/settings-context";
import { Icon } from "./icon";
import { SkeletonRows } from "./skeleton";

/**
 * Renders the honest states a remote module can be in.
 *
 * A remote module must never silently show nothing: it shows fresh data,
 * clearly labelled stale data, or an explicit unavailable/failed state. This
 * component is where those last three are drawn, so no screen invents its own
 * wording for them.
 *
 * These are the states the whole product rests on, so they are drawn to be
 * read: a tinted strip, an icon, and full-contrast text. Drawing them in muted
 * 11px on a transparent background — as this did — is the same as not drawing
 * them, and a stale number nobody notices is worse than no number at all.
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
    return (
      <div role="status" aria-busy="true" aria-label={t("state.loading")}>
        <SkeletonRows rows={5} />
      </div>
    );
  }

  // Stale still shows the data — a labelled old number is far more use than a
  // blank card.
  if (state.status === "stale") {
    return (
      <>
        <p
          role="status"
          className="mb-2 flex items-center gap-1.5 rounded-lg border border-[color:var(--color-accent-mark)] bg-surface px-2 py-1.5 text-[11px] text-text"
        >
          <Icon
            name="clock"
            className="size-3.5 shrink-0 text-[color:var(--color-accent-mark)]"
          />
          <span className="min-w-0 flex-1">
            {state.since ? `${t("state.stale-since")} ${state.since}` : t("state.stale")}
          </span>
        </p>
        {children}
      </>
    );
  }

  const failed = state.status === "failed";

  // The upstream message names a host or a status code. It is what locates the
  // fault, so it goes to the console — but it is not an instruction, and the
  // person reading it cannot act on `error sending request for url (...)`.
  if (failed) console.warn("[Sajilo] module unavailable:", state.message);

  return (
    <div
      role={failed ? "alert" : "status"}
      className="flex items-start gap-2 rounded-lg border border-border bg-surface p-2.5"
    >
      <Icon
        name={failed ? "warning" : "info"}
        className={`mt-px size-3.5 shrink-0 ${
          failed ? "text-[color:var(--color-negative)]" : "text-text-secondary"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-text">
          {failed ? t("state.failed") : t("state.not-yet")}
        </p>
        <p className="mt-0.5 text-[11px] text-text-secondary">
          {failed ? t("state.failed-hint") : t("state.not-yet-hint")}
        </p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="settings-btn mt-2">
            <Icon name="refresh" className="size-3" />
            {t("action.retry")}
          </button>
        )}
      </div>
    </div>
  );
}
