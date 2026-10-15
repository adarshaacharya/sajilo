import { useState } from "react";
import { CONTROL, CONTROL_LABEL } from "../../../shared/components/control";
import { Icon } from "../../../shared/components/icon";
import { StateBanner } from "../../../shared/components/state-banner";
import type { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { catchAsFailed, loadBanner, loadedValue } from "../../../shared/lib/load-state";
import type { InternetStatus } from "../../../types/api/InternetStatus";
import { internetTone, rupees, useInternet } from "../internet-due";

type TFn = ReturnType<typeof useSettings>["t"];

/** Longer than any WorldLink username. */
const MAX_USERNAME = 60;

/** "117 days left", "Last day today", or "Expired". */
export function daysText(t: TFn, status: InternetStatus): string {
  const days = status.daysLeft ?? 0;
  if (status.disabled || days < 0) return t("internet.expired");
  if (days === 0) return t("internet.last-day");
  return t("internet.days-left").replace("{n}", String(days));
}

/** The WorldLink row in Bills & status. */
export function InternetRow({ onOpen, t }: { onOpen: () => void; t: TFn }) {
  const { data } = useInternet();
  const status = loadedValue(data);
  const detail = !data
    ? ""
    : data.status === "unavailable"
      ? t("internet.row-setup")
      : (status?.package ?? t("internet.row-checking"));

  return (
    <section className="surface-card px-3">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2.5 py-2.5 text-left"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[5px] border border-divider bg-surface-hover text-accent-mark">
          <Icon name="wifi" className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium">{t("internet.title")}</span>
          <span className="mt-0.5 block truncate text-[10px] text-text-muted">{detail}</span>
        </span>
        {status ? (
          <span className={`shrink-0 text-[10px] font-medium ${internetTone(status)}`}>
            {daysText(t, status)}
          </span>
        ) : (
          <Icon name="chevronRight" className="size-3 shrink-0 text-text-muted" />
        )}
      </button>
    </section>
  );
}

/** The subscription's page: set up once, then days left and renewal. */
export function InternetPage({ t }: { t: TFn }) {
  const { data, mutate, isValidating } = useInternet();
  const [editing, setEditing] = useState(false);

  if (!data) return <StateBanner state={{ status: "loading" }} />;
  if (data.status === "unavailable" || editing) {
    return (
      <Setup
        t={t}
        onSaved={(status) => {
          setEditing(false);
          void mutate({ status: "fresh", value: status }, { revalidate: false });
        }}
        onCancel={data.status === "unavailable" ? undefined : () => setEditing(false)}
        onRemoved={() => {
          setEditing(false);
          void mutate({ status: "unavailable" }, { revalidate: false });
        }}
      />
    );
  }

  const status = loadedValue(data);
  return (
    <StateBanner
      state={loadBanner(data)}
      onRetry={() => mutate(catchAsFailed(api.getInternet(true)))}
    >
      {status && (
        <section className="surface-card p-3">
          <p className="text-[11px] font-semibold text-text-secondary">{status.package}</p>
          <p className={`mt-0.5 text-[22px] font-bold leading-tight ${internetTone(status)}`}>
            {daysText(t, status)}
          </p>
          {status.expiresLabel && !status.disabled && (
            <p className="mt-0.5 text-[12px] text-text-secondary">
              {t("internet.runs-out").replace("{date}", status.expiresLabel)}
            </p>
          )}
          <div className="mt-2 space-y-1 border-divider border-t pt-2 text-[11px]">
            {status.renewalRate != null && (
              <p className="flex justify-between gap-2">
                <span className="text-text-muted">{t("internet.renewal")}</span>
                <span className="tabular-nums">{rupees(status.renewalRate)}</span>
              </p>
            )}
            {status.amountDue > 0 && (
              <p className="flex justify-between gap-2">
                <span className="text-text-muted">{t("internet.due")}</span>
                <span className="text-holiday tabular-nums">{rupees(status.amountDue)}</span>
              </p>
            )}
            {status.branch && (
              <p className="flex justify-between gap-2">
                <span className="text-text-muted">{t("internet.branch")}</span>
                <span>{status.branch}</span>
              </p>
            )}
          </div>
        </section>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-2 px-0.5">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[11px] font-medium text-accent-mark"
        >
          {t("internet.change")}
        </button>
        <button
          type="button"
          onClick={() => mutate(catchAsFailed(api.getInternet(true)), { revalidate: false })}
          disabled={isValidating}
          className="icon-btn"
          aria-label={t("action.refresh")}
        >
          <Icon name="refresh" className={`size-3.5 ${isValidating ? "animate-spin" : ""}`} />
        </button>
      </div>
      <p className="mt-2 px-0.5 text-[10px] leading-relaxed text-text-muted">
        {t("internet.reminders")}
      </p>
    </StateBanner>
  );
}

/** The username, checked with WorldLink before it's kept. */
function Setup({
  t,
  onSaved,
  onCancel,
  onRemoved,
}: {
  t: TFn;
  onSaved: (status: InternetStatus) => void;
  onCancel?: () => void;
  onRemoved: () => void;
}) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      onSaved(await api.setWorldlinkAccount({ username }));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="surface-card space-y-2.5 p-3">
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Icon name="wifi" className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold leading-snug">{t("internet.setup-title")}</h2>
          <p className="mt-0.5 text-[11.5px] leading-snug text-text-secondary">
            {t("internet.setup-body")}
          </p>
        </div>
      </div>
      <label className="block">
        <span className={CONTROL_LABEL}>{t("internet.username-label")}</span>
        <input
          value={username}
          maxLength={MAX_USERNAME}
          onChange={(event) => setUsername(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && username.trim()) void save();
          }}
          placeholder="ramthapa"
          spellCheck={false}
          autoCapitalize="off"
          className={CONTROL}
        />
      </label>
      <p className="text-[10px] leading-snug text-text-muted">{t("internet.privacy")}</p>
      {error && (
        <p role="alert" className="text-[11px] text-holiday">
          {error}
        </p>
      )}
      <div className={`grid gap-2 ${onCancel ? "grid-cols-2" : "grid-cols-1"}`}>
        {onCancel && (
          <button type="button" onClick={onCancel} className="settings-btn w-full justify-center">
            {t("electricity.cancel")}
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={busy || !username.trim()}
          className="settings-btn settings-btn--accent w-full justify-center"
        >
          {busy ? t("internet.checking") : t("electricity.save")}
        </button>
      </div>
      {onCancel && (
        <button
          type="button"
          onClick={() => {
            api
              .clearWorldlinkAccount()
              .then(onRemoved)
              .catch(() => {});
          }}
          className="text-[11px] text-text-muted hover:text-text-secondary"
        >
          {t("internet.remove")}
        </button>
      )}
    </section>
  );
}
