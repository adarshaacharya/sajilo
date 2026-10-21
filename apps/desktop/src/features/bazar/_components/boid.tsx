import { useState } from "react";
import { CONTROL } from "../../../shared/components/control";
import { Icon } from "../../../shared/components/icon";
import { StateBanner } from "../../../shared/components/state-banner";
import type { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { catchAsFailed, loadBanner, loadedValue } from "../../../shared/lib/load-state";
import type { BoidAccount } from "../../../types/api/BoidAccount";
import type { BoidReport } from "../../../types/api/BoidReport";
import { rupees } from "../../bills/electricity-due";
import { REGISTRAR_NAMES, useBoidAccounts, useBoidReport } from "../boid-due";

type TFn = ReturnType<typeof useSettings>["t"];

/** "1301 0000 0000 0001", as MeroShare prints it. */
const MAX_BOID = 19;
const MAX_LABEL = 24;
const MAX_ACCOUNTS = 10;

/** The BOID row in Bills & status. */
export function BoidRow({ onOpen, t }: { onOpen: () => void; t: TFn }) {
  const { data } = useBoidReport();
  const report = loadedValue(data);
  const fresh = report?.ipos.filter((ipo) => ipo.isNew).length ?? 0;
  const detail = !data
    ? t("boid.row-checking")
    : data.status === "unavailable"
      ? t("boid.row-setup")
      : report
        ? summary(t, report)
        : t("boid.row-checking");

  return (
    <section className="surface-card px-3">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2.5 py-2.5 text-left"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[5px] border border-divider bg-surface-hover text-accent-mark">
          <Icon name="interest" className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium">{t("boid.title")}</span>
          <span className="mt-0.5 block truncate text-[10px] text-text-muted">{detail}</span>
        </span>
        {fresh > 0 ? (
          <span className="shrink-0 rounded-md bg-[color-mix(in_srgb,var(--color-accent-mark)_14%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--color-accent-mark)]">
            {t("boid.new-count").replace("{n}", String(fresh))}
          </span>
        ) : (
          <Icon name="chevronRight" className="size-3 shrink-0 text-text-muted" />
        )}
      </button>
    </section>
  );
}

function summary(t: TFn, report: BoidReport): string {
  const allotted = report.accounts.reduce((sum, account) => sum + account.allotments, 0);
  const parts = [t("boid.allotments-count").replace("{n}", String(allotted))];
  if (report.accounts.length > 1) {
    parts.unshift(t("boid.accounts-count").replace("{n}", String(report.accounts.length)));
  }
  if (report.dividends.length > 0) {
    parts.push(t("boid.dividends-count").replace("{n}", String(report.dividends.length)));
  }
  return parts.join(" · ");
}

/** The BOIDs' page: who is checked, then only what was found. */
export function BoidPage({ t }: { t: TFn }) {
  const accounts = useBoidAccounts();
  const { data, mutate, isValidating } = useBoidReport();
  const [managing, setManaging] = useState(false);
  const [person, setPerson] = useState<string | null>(null);

  const saved = accounts.data;
  if (!saved) return null;
  if (saved.length === 0 || managing) {
    return (
      <Manage
        t={t}
        accounts={saved}
        onChange={(next) => {
          void accounts.mutate(next, { revalidate: false });
          if (next.length === 0) {
            void mutate({ status: "unavailable" }, { revalidate: false });
          } else {
            // Only BOIDs never checked are asked about; the rest come cached.
            void mutate(catchAsFailed(api.getBoidReport(false)), { revalidate: false });
          }
          if (person && !next.some((account) => account.boid === person)) setPerson(null);
        }}
        onDone={saved.length > 0 ? () => setManaging(false) : undefined}
      />
    );
  }
  if (!data || data.status === "unavailable") {
    return (
      <section className="surface-card flex items-center gap-2.5 p-3 text-[12px] text-text-secondary">
        <Icon name="refresh" className="size-3.5 animate-spin" />
        {t("boid.first-check")}
      </section>
    );
  }

  const report = loadedValue(data);
  return (
    <StateBanner
      state={loadBanner(data)}
      onRetry={() => mutate(catchAsFailed(api.getBoidReport(true)))}
    >
      <div className="space-y-2.5">
        <section className="surface-card space-y-2 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-text-secondary">{t("boid.people")}</p>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setManaging(true)}
                className="flex items-center gap-1 rounded-[5px] px-1.5 py-1 text-[11px] font-medium text-accent-mark hover:bg-surface-hover"
                title={t("boid.edit")}
              >
                <Icon name="pencil" className="size-3" />
                {t("boid.edit-short")}
              </button>
              <button
                type="button"
                onClick={() =>
                  mutate(catchAsFailed(api.getBoidReport(true)), { revalidate: false })
                }
                disabled={isValidating}
                className="icon-btn"
                aria-label={t("action.refresh")}
                title={t("action.refresh")}
              >
                <Icon name="refresh" className={`size-3.5 ${isValidating ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(report?.accounts ?? []).map((account) =>
              (report?.accounts.length ?? 0) > 1 ? (
                <button
                  type="button"
                  key={account.boid}
                  aria-pressed={person === account.boid}
                  onClick={() => setPerson(person === account.boid ? null : account.boid)}
                  className={`toggle-chip ${person === account.boid ? "toggle-chip--on" : "toggle-chip--off"}`}
                >
                  {account.name}
                </button>
              ) : (
                <span key={account.boid} className="toggle-chip toggle-chip--off">
                  {account.name}
                </span>
              ),
            )}
            {saved.length < MAX_ACCOUNTS && (
              <button
                type="button"
                onClick={() => setManaging(true)}
                className="toggle-chip gap-1 border-dashed border-divider text-accent-mark hover:bg-surface-hover"
              >
                <Icon name="plus" className="size-3" />
                {t("boid.add-person")}
              </button>
            )}
          </div>
          {(report?.accounts.length ?? 0) > 1 && (
            <p className="text-[10px] text-text-muted">{t("boid.tap-name")}</p>
          )}
        </section>
        {report && <Report report={report} person={person} checking={isValidating} t={t} />}
      </div>
    </StateBanner>
  );
}

/**
 * Only what was found. With several BOIDs each issue names who got shares;
 * with one, or one person picked, it shows the kitta.
 */
function Report({
  report,
  person,
  checking,
  t,
}: {
  report: BoidReport;
  person: string | null;
  checking: boolean;
  t: TFn;
}) {
  const [details, setDetails] = useState(false);
  const family = report.accounts.length > 1 && person === null;
  const own = (ipo: BoidReport["ipos"][number]) =>
    ipo.holders.find((holder) => holder.boid === (person ?? report.accounts[0]?.boid));
  const ipos = family ? report.ipos : report.ipos.filter((ipo) => own(ipo)?.allotted != null);
  const personName = report.accounts.find((account) => account.boid === person)?.name;
  const dividends = personName
    ? report.dividends.filter((dividend) => dividend.holder === personName)
    : report.dividends;
  const reached = report.registrars.filter((check) => check.ok);
  const missed = report.registrars.filter((check) => !check.ok);
  const unchecked = report.accounts.filter((account) => !account.ok);
  const names = (list: typeof report.registrars) =>
    list.map((check) => REGISTRAR_NAMES[check.registrar]).join(", ");

  return (
    <>
      <section className="surface-card px-3" aria-label={t("boid.allotments")}>
        {ipos.length === 0 ? (
          <p className="py-3 text-[11px] text-text-muted">{t("boid.no-allotments")}</p>
        ) : (
          ipos.map((ipo) => {
            const mine = own(ipo);
            const got = ipo.holders.filter((holder) => holder.allotted != null);
            return (
              <div
                key={ipo.id}
                className="flex items-center justify-between gap-3 border-divider border-b py-2 last:border-0"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[12px] font-medium">
                    {(family ? ipo.isNew : mine?.isNew) && (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-[color:var(--color-accent-mark)]"
                        role="img"
                        aria-label={t("boid.new")}
                      />
                    )}
                    <span className="truncate">{ipo.company}</span>
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-text-muted">
                    {[REGISTRAR_NAMES[ipo.registrar], ipo.publishedLabel]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {family ? (
                  <div className="flex max-w-[55%] shrink-0 flex-wrap justify-end gap-1">
                    {got.map((holder) => (
                      <span
                        key={holder.boid}
                        className="rounded-md bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] px-1.5 py-0.5 text-[10.5px] font-medium text-positive tabular-nums"
                      >
                        {holder.name} {holder.allotted}
                      </span>
                    ))}
                  </div>
                ) : (
                  mine?.allotted != null && (
                    <span className="shrink-0 text-[12px] font-semibold text-positive tabular-nums">
                      {t("boid.kitta").replace("{n}", String(mine.allotted))}
                    </span>
                  )
                )}
              </div>
            );
          })
        )}
      </section>

      {dividends.length > 0 && (
        <section className="surface-card px-3" aria-label={t("boid.dividends")}>
          <p className="pt-2.5 text-[11px] font-semibold text-text-secondary">
            {t("boid.dividends")}
          </p>
          {dividends.map((dividend) => (
            <div
              key={`${dividend.holder}:${dividend.registrar}:${dividend.company}:${dividend.fiscalYear ?? ""}`}
              className="flex items-center justify-between gap-3 border-divider border-b py-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium">{dividend.company}</p>
                <p className="mt-0.5 truncate text-[10px] text-text-muted">
                  {[family ? dividend.holder : null, dividend.fiscalYear]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <span className="shrink-0 text-[12px] font-semibold text-positive tabular-nums">
                {rupees(dividend.amount)}
              </span>
            </div>
          ))}
        </section>
      )}

      <div className="px-0.5">
        <button
          type="button"
          onClick={() => setDetails((open) => !open)}
          aria-expanded={details}
          className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary"
        >
          {checking
            ? t("boid.checking-now")
            : missed.length + unchecked.length > 0
              ? t("boid.checked-some")
                  .replace("{ok}", String(reached.length))
                  .replace("{n}", String(report.registrars.length))
              : t("boid.checked-count").replace("{n}", String(report.registrars.length))}
          <Icon name="info" className="size-3" />
        </button>
        {details && (
          <p className="mt-1 text-[10px] leading-relaxed text-text-muted">
            {t("boid.checked").replace("{list}", names(reached))}
            {missed.length > 0 && ` ${t("boid.failed").replace("{list}", names(missed))}`}
            {unchecked.length > 0 &&
              ` ${t("boid.account-failed").replace(
                "{list}",
                unchecked.map((account) => account.name).join(", "),
              )}`}{" "}
            {t("boid.not-covered")}
          </p>
        )}
      </div>
    </>
  );
}

/** Adding, naming and removing BOIDs. With none yet, it is the setup. */
function Manage({
  t,
  accounts,
  onChange,
  onDone,
}: {
  t: TFn;
  accounts: BoidAccount[];
  onChange: (accounts: BoidAccount[]) => void;
  onDone?: () => void;
}) {
  const [label, setLabel] = useState("");
  const [boid, setBoid] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const full = accounts.length >= MAX_ACCOUNTS;
  const ready = boid.replace(/\D/g, "").length === 16 && !full;

  const save = async (next: BoidAccount[]) => {
    setBusy(true);
    setError("");
    try {
      onChange(await api.setBoidAccounts(next));
      return true;
    } catch (reason) {
      setError(String(reason));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!ready || busy) return;
    if (await save([...accounts, { boid, label }])) {
      setBoid("");
      setLabel("");
    }
  };

  return (
    <section className="surface-card space-y-2.5 p-3">
      {accounts.length === 0 ? (
        // The page is already titled; one line says what to do.
        <p className="text-[12px] text-text-secondary">{t("boid.setup-body")}</p>
      ) : (
        <div className="flex items-center justify-between">
          <h2 className="text-[12px] font-semibold">{t("boid.manage-title")}</h2>
          {onDone && (
            <button
              type="button"
              onClick={onDone}
              className="text-[11px] font-medium text-accent-mark"
            >
              {t("boid.done")}
            </button>
          )}
        </div>
      )}

      {accounts.length > 0 && (
        <ul>
          {accounts.map((account) => (
            <li
              key={account.boid}
              className="flex items-center gap-2 border-divider border-b py-1 last:border-0"
            >
              <input
                defaultValue={account.label}
                maxLength={MAX_LABEL}
                placeholder={t("boid.name-placeholder")}
                aria-label={t("boid.name-label")}
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next === account.label) return;
                  void save(
                    accounts.map((known) =>
                      known.boid === account.boid ? { ...known, label: next } : known,
                    ),
                  );
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                className="min-w-0 flex-1 bg-transparent text-[12px] font-medium outline-none placeholder:text-text-muted"
              />
              <span className="shrink-0 text-[10.5px] text-text-muted tabular-nums">
                {grouped(account.boid)}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(accounts.filter((known) => known.boid !== account.boid))}
                className="icon-btn"
                aria-label={t("boid.remove").replace(
                  "{name}",
                  account.label || grouped(account.boid),
                )}
              >
                <Icon name="close" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {full ? (
        <p className="text-[11px] text-text-muted">{t("boid.full")}</p>
      ) : (
        // The BOID first and full width: it's the one thing that matters.
        // The name, optional, sits under it beside Add.
        <div className="space-y-1.5">
          <input
            value={boid}
            maxLength={MAX_BOID}
            inputMode="numeric"
            onChange={(event) => setBoid(event.target.value.replace(/[^\d ]/g, ""))}
            onKeyDown={(event) => {
              if (event.key === "Enter") void add();
            }}
            placeholder={t("boid.placeholder")}
            aria-label={t("boid.label")}
            className={`${CONTROL} h-[30px] text-[12.5px] tabular-nums`}
          />
          <div className="flex gap-1.5">
            <input
              value={label}
              maxLength={MAX_LABEL}
              onChange={(event) => setLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void add();
              }}
              placeholder={t("boid.name-optional")}
              aria-label={t("boid.name-label")}
              className={`${CONTROL} h-[30px] min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={() => void add()}
              disabled={busy || !ready}
              className="settings-btn settings-btn--accent h-[30px] shrink-0 px-3"
            >
              {t("boid.add")}
            </button>
          </div>
        </div>
      )}
      <p className="flex items-center gap-1 text-[10px] text-text-muted">
        <Icon name="shield" className="size-2.5" />
        {t("boid.privacy")}
      </p>
      {error && (
        <p role="alert" className="text-[11px] text-holiday">
          {error}
        </p>
      )}
    </section>
  );
}

/** "1301000000000001" → "1301 0000 0000 0001". */
function grouped(boid: string): string {
  return boid.replace(/(\d{4})(?=\d)/g, "$1 ");
}
