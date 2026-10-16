import { useState } from "react";
import { CONTROL, CONTROL_LABEL } from "../../../shared/components/control";
import { Icon } from "../../../shared/components/icon";
import { StateBanner } from "../../../shared/components/state-banner";
import type { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { loadBanner, loadedValue } from "../../../shared/lib/load-state";
import type { InternetAccount } from "../../../types/api/InternetAccount";
import type { InternetStatus } from "../../../types/api/InternetStatus";
import { internetTone, rupees, useInternet } from "../internet-due";

type TFn = ReturnType<typeof useSettings>["t"];

/** Longer than any WorldLink username. */
const MAX_USERNAME = 60;
const MAX_LABEL = 24;

/** "117 days left", "Last day today", or "Expired". */
export function daysText(t: TFn, status: InternetStatus): string {
  const days = status.daysLeft ?? 0;
  if (status.disabled || days < 0) return t("internet.expired");
  if (days === 0) return t("internet.last-day");
  return t("internet.days-left").replace("{n}", String(days));
}

/** One WorldLink account's row in Bills. */
export function InternetRow({
  account,
  named,
  onOpen,
  t,
}: {
  account: InternetAccount;
  /** Several accounts: the row says whose. */
  named: boolean;
  onOpen: () => void;
  t: TFn;
}) {
  const status = loadedValue(account.state);
  const detail =
    status?.package ??
    (account.state.status === "failed" ? t("internet.unreachable") : t("internet.row-checking"));

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
          <span className="block truncate text-[12px] font-medium">
            {named
              ? t("internet.title-named").replace("{name}", account.name)
              : t("internet.title")}
          </span>
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

/**
 * One account's page: days left, renewal, and renaming or removing it. With
 * no `username`, the form that adds one.
 */
export function InternetPage({
  username,
  onAdded,
  onRemoved,
  t,
}: {
  username: string | null;
  onAdded: (username: string) => void;
  onRemoved: () => void;
  t: TFn;
}) {
  const { data, mutate, isValidating } = useInternet();
  const [renaming, setRenaming] = useState(false);
  const account = data?.find((entry) => entry.username === username);

  if (username === null) {
    return (
      <Setup
        t={t}
        onSaved={(added) => {
          void mutate();
          onAdded(added);
        }}
      />
    );
  }
  if (!data) return <StateBanner state={{ status: "loading" }} />;
  if (!account) return null;

  const status = loadedValue(account.state);
  const refresh = () => mutate(api.getInternet(true), { revalidate: false }).catch(() => undefined);
  return (
    <StateBanner state={loadBanner(account.state)} onRetry={refresh}>
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
            <p className="flex justify-between gap-2">
              <span className="text-text-muted">{t("internet.username")}</span>
              <span>{account.username}</span>
            </p>
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
      {renaming ? (
        <Rename
          account={account}
          onDone={() => {
            setRenaming(false);
            void mutate();
          }}
          t={t}
        />
      ) : (
        <div className="mt-2.5 flex items-center gap-3 px-0.5">
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="text-[11px] font-medium text-accent-mark"
          >
            {t("internet.rename")}
          </button>
          <button
            type="button"
            onClick={() => {
              api
                .removeWorldlinkAccount(account.username)
                .then(() => mutate())
                .then(onRemoved)
                .catch(() => {});
            }}
            className="text-[11px] text-text-muted hover:text-text-secondary"
          >
            {t("internet.remove")}
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={refresh}
            disabled={isValidating}
            className="icon-btn"
            aria-label={t("action.refresh")}
          >
            <Icon name="refresh" className={`size-3.5 ${isValidating ? "animate-spin" : ""}`} />
          </button>
        </div>
      )}
      <p className="mt-2 px-0.5 text-[10px] leading-relaxed text-text-muted">
        {t("internet.reminders")}
      </p>
    </StateBanner>
  );
}

/** A new name for one account, in place. */
function Rename({ account, onDone, t }: { account: InternetAccount; onDone: () => void; t: TFn }) {
  const [label, setLabel] = useState(account.name === account.username ? "" : account.name);
  const save = () =>
    api
      .renameWorldlinkAccount(account.username, label)
      .then(onDone)
      .catch(() => {});
  return (
    <div className="mt-2.5 flex items-end gap-1.5 px-0.5">
      <label className="block min-w-0 flex-1">
        <span className={CONTROL_LABEL}>{t("internet.name-label")}</span>
        <input
          value={label}
          maxLength={MAX_LABEL}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save();
          }}
          placeholder={t("internet.name-placeholder")}
          className={CONTROL}
        />
      </label>
      <button
        type="button"
        onClick={() => void save()}
        className="settings-btn settings-btn--accent h-[22px] shrink-0"
      >
        {t("electricity.save")}
      </button>
    </div>
  );
}

/** A username and a name, checked with WorldLink before it's kept. */
function Setup({ t, onSaved }: { t: TFn; onSaved: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!username.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.addWorldlinkAccount({ username, label });
      onSaved(username.trim());
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
      <div className="flex gap-1.5">
        <label className="block w-[38%] min-w-0">
          <span className={CONTROL_LABEL}>{t("internet.name-label")}</span>
          <input
            value={label}
            maxLength={MAX_LABEL}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
            }}
            placeholder={t("internet.name-placeholder")}
            className={CONTROL}
          />
        </label>
        <label className="block min-w-0 flex-1">
          <span className={CONTROL_LABEL}>{t("internet.username-label")}</span>
          <input
            value={username}
            maxLength={MAX_USERNAME}
            onChange={(event) => setUsername(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
            }}
            placeholder="ramthapa"
            spellCheck={false}
            autoCapitalize="off"
            className={CONTROL}
          />
        </label>
      </div>
      <p className="text-[10px] leading-snug text-text-muted">{t("internet.privacy")}</p>
      {error && (
        <p role="alert" className="text-[11px] text-holiday">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || !username.trim()}
        className="settings-btn settings-btn--accent w-full justify-center"
      >
        {busy ? t("internet.checking") : t("electricity.save")}
      </button>
    </section>
  );
}
