import { useState } from "react";
import { CONTROL, CONTROL_LABEL } from "../../../shared/components/control";
import { Icon } from "../../../shared/components/icon";
import { StateBanner } from "../../../shared/components/state-banner";
import type { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { catchAsFailed, loadBanner, loadedValue } from "../../../shared/lib/load-state";
import type { BoidReport } from "../../../types/api/BoidReport";
import { REGISTRAR_NAMES, useBoidReport } from "../boid-due";
import { rupees } from "../electricity-due";

type TFn = ReturnType<typeof useSettings>["t"];

/** "1301 0000 0000 0001", as MeroShare prints it. */
const MAX_BOID = 19;

/** The BOID row in Bills & status. */
export function BoidRow({ onOpen, t }: { onOpen: () => void; t: TFn }) {
  const { data } = useBoidReport();
  const report = loadedValue(data);
  const fresh = report?.allotments.filter((a) => a.isNew).length ?? 0;
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
  const parts = [t("boid.allotments-count").replace("{n}", String(report.allotments.length))];
  if (report.dividends.length > 0) {
    parts.push(t("boid.dividends-count").replace("{n}", String(report.dividends.length)));
  }
  return parts.join(" · ");
}

/** The BOID's page: set up once, then allotments, dividends and the checks. */
export function BoidPage({ t }: { t: TFn }) {
  const { data, mutate, isValidating } = useBoidReport();
  const [editing, setEditing] = useState(false);

  if (!data) {
    return (
      <section className="surface-card flex items-center gap-2.5 p-3 text-[12px] text-text-secondary">
        <Icon name="refresh" className="size-3.5 animate-spin" />
        {t("boid.first-check")}
      </section>
    );
  }
  if (data.status === "unavailable" || editing) {
    return (
      <Setup
        t={t}
        onSaved={() => {
          setEditing(false);
          void mutate(catchAsFailed(api.getBoidReport(true)));
        }}
        onCancel={data.status === "unavailable" ? undefined : () => setEditing(false)}
        onRemoved={() => {
          setEditing(false);
          void mutate({ status: "unavailable" }, { revalidate: false });
        }}
      />
    );
  }

  const report = loadedValue(data);
  return (
    <StateBanner
      state={loadBanner(data)}
      onRetry={() => mutate(catchAsFailed(api.getBoidReport(true)))}
    >
      {report && <Report report={report} t={t} />}
      <div className="mt-2.5 flex items-center justify-between gap-2 px-0.5">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[11px] font-medium text-accent-mark"
        >
          {t("boid.change")}
        </button>
        <button
          type="button"
          onClick={() => mutate(catchAsFailed(api.getBoidReport(true)), { revalidate: false })}
          disabled={isValidating}
          className="icon-btn"
          aria-label={t("action.refresh")}
        >
          <Icon name="refresh" className={`size-3.5 ${isValidating ? "animate-spin" : ""}`} />
        </button>
      </div>
    </StateBanner>
  );
}

function Report({ report, t }: { report: BoidReport; t: TFn }) {
  const failed = report.registrars.filter((check) => !check.ok);
  const checked = report.registrars.filter((check) => check.ok);
  return (
    <div className="space-y-2.5">
      <section className="surface-card px-3" aria-label={t("boid.allotments")}>
        <p className="pt-2.5 text-[11px] font-semibold text-text-secondary">
          {t("boid.allotments")}
        </p>
        {report.allotments.length === 0 ? (
          <p className="py-2.5 text-[11px] text-text-muted">{t("boid.no-allotments")}</p>
        ) : (
          report.allotments.map((allotment) => (
            <div
              key={allotment.id}
              className="flex items-start justify-between gap-2 border-divider border-b py-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[12px] font-medium">
                  {allotment.isNew && (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-[color:var(--color-accent-mark)]"
                      role="img"
                      aria-label={t("boid.new")}
                    />
                  )}
                  <span className="line-clamp-2">{allotment.company}</span>
                </p>
                <p className="mt-0.5 truncate text-[10px] text-text-muted">
                  {[REGISTRAR_NAMES[allotment.registrar], allotment.publishedLabel]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[12px] font-semibold text-positive tabular-nums">
                  {t("boid.kitta").replace("{n}", String(allotment.allotted))}
                </p>
                {allotment.applied != null && (
                  <p className="mt-0.5 text-[10px] text-text-muted">
                    {t("boid.of-applied").replace("{n}", String(allotment.applied))}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="surface-card px-3" aria-label={t("boid.dividends")}>
        <p className="pt-2.5 text-[11px] font-semibold text-text-secondary">
          {t("boid.dividends")}
        </p>
        {report.dividends.length === 0 ? (
          <p className="py-2.5 text-[11px] text-text-muted">{t("boid.no-dividends")}</p>
        ) : (
          report.dividends.map((dividend) => (
            <div
              key={`${dividend.registrar}:${dividend.company}:${dividend.fiscalYear ?? ""}`}
              className="flex items-start justify-between gap-2 border-divider border-b py-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium">{dividend.company}</p>
                <p className="mt-0.5 truncate text-[10px] text-text-muted">
                  {[REGISTRAR_NAMES[dividend.registrar], dividend.fiscalYear]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <p className="shrink-0 text-[12px] font-semibold text-positive tabular-nums">
                {rupees(dividend.amount)}
              </p>
            </div>
          ))
        )}
      </section>

      <p className="px-0.5 text-[10px] leading-relaxed text-text-muted">
        {t("boid.checked").replace(
          "{list}",
          checked.map((check) => REGISTRAR_NAMES[check.registrar]).join(", "),
        )}
        {failed.length > 0 &&
          ` ${t("boid.failed").replace(
            "{list}",
            failed.map((check) => REGISTRAR_NAMES[check.registrar]).join(", "),
          )}`}{" "}
        {t("boid.not-covered")}
      </p>
    </div>
  );
}

/** The BOID, entered once. */
function Setup({
  t,
  onSaved,
  onCancel,
  onRemoved,
}: {
  t: TFn;
  onSaved: () => void;
  onCancel?: () => void;
  onRemoved: () => void;
}) {
  const [boid, setBoid] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api.setBoidAccount({ boid });
      onSaved();
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
          <Icon name="interest" className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold leading-snug">{t("boid.setup-title")}</h2>
          <p className="mt-0.5 text-[11.5px] leading-snug text-text-secondary">
            {t("boid.setup-body")}
          </p>
        </div>
      </div>
      <label className="block">
        <span className={CONTROL_LABEL}>{t("boid.label")}</span>
        <input
          value={boid}
          maxLength={MAX_BOID}
          inputMode="numeric"
          onChange={(event) => setBoid(event.target.value.replace(/[^\d ]/g, ""))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && boid.trim()) void save();
          }}
          placeholder="1301000000000001"
          className={`${CONTROL} tabular-nums`}
        />
      </label>
      <p className="text-[10px] leading-snug text-text-muted">{t("boid.privacy")}</p>
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
          disabled={busy || boid.replace(/\D/g, "").length !== 16}
          className="settings-btn settings-btn--accent w-full justify-center"
        >
          {t("electricity.save")}
        </button>
      </div>
      {onCancel && (
        <button
          type="button"
          onClick={() => {
            api
              .clearBoidAccount()
              .then(onRemoved)
              .catch(() => {});
          }}
          className="text-[11px] text-text-muted hover:text-text-secondary"
        >
          {t("boid.remove")}
        </button>
      )}
    </section>
  );
}
