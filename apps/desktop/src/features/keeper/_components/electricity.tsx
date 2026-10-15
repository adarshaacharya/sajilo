import { useState } from "react";
import useSWR from "swr";
import { CONTROL, CONTROL_LABEL } from "../../../shared/components/control";
import { Icon } from "../../../shared/components/icon";
import { Select } from "../../../shared/components/select";
import { StateBanner } from "../../../shared/components/state-banner";
import { api } from "../../../shared/lib/ipc";
import { catchAsFailed, loadBanner, loadedValue } from "../../../shared/lib/load-state";
import type { ElectricityBill } from "../../../types/api/ElectricityBill";
import type { ElectricityStatement } from "../../../types/api/ElectricityStatement";
import type { TFn } from "../_lib/shared";
import { dueLine, dueToneOf, rupees, useElectricity } from "../electricity-due";

/** Longer than any SC number or consumer id printed on a bill. */
const MAX_FIELD = 40;

/**
 * The electricity bill's row in Keeper's reminders: an invitation before it
 * is set up, the latest bill and what it needs after.
 */
export function ElectricityRow({ onOpen, t }: { onOpen: () => void; t: TFn }) {
  const { data } = useElectricity();
  const statement = loadedValue(data);
  const latest = statement?.bills.find((bill) => !bill.isArrears);
  const due = statement?.due;

  const detail = !data
    ? ""
    : data.status === "unavailable"
      ? t("electricity.row-setup")
      : latest
        ? `${latest.month} · ${rupees(latest.amount)}`
        : t("electricity.row-checking");

  return (
    <section className="surface-card px-3">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2.5 py-2.5 text-left"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[5px] border border-divider bg-surface-hover text-accent-mark">
          <Icon name="bolt" className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium">{t("electricity.title")}</span>
          <span className="mt-0.5 block truncate text-[10px] text-text-muted">{detail}</span>
        </span>
        {due ? (
          <span className={`shrink-0 text-[10px] font-medium ${dueToneOf(due)}`}>
            {due.daysLeft != null && due.stage !== "penalty"
              ? t("electricity.days").replace("{n}", String(due.daysLeft))
              : t("electricity.overdue")}
          </span>
        ) : latest?.paid ? (
          <span className="shrink-0 text-[10px] font-medium text-positive">
            {t("electricity.paid")}
          </span>
        ) : (
          <Icon name="chevronRight" className="size-3 shrink-0 text-text-muted" />
        )}
      </button>
    </section>
  );
}

/** The bill's page: set up once, then what is due and the months before. */
export function ElectricityPage({ t }: { t: TFn }) {
  const { data, mutate, isValidating } = useElectricity();
  const [editing, setEditing] = useState(false);

  if (!data) return <StateBanner state={{ status: "loading" }} />;
  if (data.status === "unavailable" || editing) {
    return (
      <Setup
        t={t}
        onSaved={(statement) => {
          setEditing(false);
          void mutate({ status: "fresh", value: statement }, { revalidate: false });
        }}
        onCancel={data.status === "unavailable" ? undefined : () => setEditing(false)}
        onRemoved={() => {
          setEditing(false);
          void mutate({ status: "unavailable" }, { revalidate: false });
        }}
      />
    );
  }

  const statement = loadedValue(data);
  return (
    <StateBanner
      state={loadBanner(data)}
      onRetry={() => mutate(catchAsFailed(api.getElectricity(true)))}
    >
      {statement && <Statement statement={statement} t={t} />}
      <div className="mt-2.5 flex items-center justify-between gap-2 px-0.5">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[11px] font-medium text-accent-mark"
        >
          {t("electricity.change")}
        </button>
        <button
          type="button"
          onClick={() => mutate(catchAsFailed(api.getElectricity(true)), { revalidate: false })}
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

function Statement({ statement, t }: { statement: ElectricityStatement; t: TFn }) {
  const due = statement.due;
  const months = statement.bills.filter((bill) => !bill.isArrears);
  const [latest, previous] = months;
  const change =
    latest && previous && previous.units > 0
      ? Math.round(((latest.units - previous.units) / previous.units) * 100)
      : null;

  return (
    <div className="space-y-2.5">
      <section className="surface-card p-3">
        {due ? (
          <>
            <p className="text-[11px] font-semibold text-text-secondary">
              {t("electricity.to-pay").replace("{month}", due.month)}
            </p>
            <p className="mt-0.5 text-[22px] font-bold leading-tight tabular-nums">
              {rupees(due.withRebate ?? due.total)}
            </p>
            <p className={`mt-0.5 text-[12px] font-medium ${dueToneOf(due)}`}>
              {dueLine(t, due)}
              {due.untilLabel && <span className="text-text-muted"> · {due.untilLabel}</span>}
            </p>
            {due.withRebate != null && (
              <p className="mt-1 text-[10.5px] text-text-muted">
                {t("electricity.billed").replace("{amount}", rupees(due.total))}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-positive">
              <Icon name="checkmark" className="size-3.5" />
              {t("electricity.all-paid")}
            </p>
            {statement.paidUpto && (
              <p className="mt-0.5 text-[11px] text-text-secondary">
                {t("electricity.paid-upto").replace("{month}", statement.paidUpto)}
                {statement.advance > 0 &&
                  ` · ${t("electricity.advance").replace("{amount}", `Rs ${statement.advance.toFixed(2)}`)}`}
              </p>
            )}
          </>
        )}
        {latest && (
          <p className="mt-2 border-divider border-t pt-2 text-[11px] text-text-secondary">
            {t("electricity.units")
              .replace("{units}", String(latest.units))
              .replace("{month}", latest.month)}
            {change != null && (
              <span className={change > 0 ? "text-holiday" : "text-positive"}>
                {" "}
                ({change > 0 ? "+" : ""}
                {change}%)
              </span>
            )}
          </p>
        )}
      </section>

      <section className="surface-card px-3" aria-label={t("electricity.history")}>
        <p className="pt-2.5 text-[11px] font-semibold text-text-secondary">
          {t("electricity.history")}
        </p>
        {statement.bills.map((bill) => (
          <BillRow key={`${bill.month}:${bill.billDate}`} bill={bill} t={t} />
        ))}
      </section>
      <p className="px-0.5 text-[10px] leading-relaxed text-text-muted">
        {t("electricity.office").replace("{office}", statement.office)} · {t("electricity.rules")}
      </p>
    </div>
  );
}

function BillRow({ bill, t }: { bill: ElectricityBill; t: TFn }) {
  const label = bill.isArrears ? t("electricity.arrears") : bill.month;
  const note =
    bill.adjustment === "rebate"
      ? t("electricity.with-rebate").replace("{rate}", String(bill.adjustmentRate))
      : bill.adjustment === "penalty"
        ? t("electricity.with-penalty").replace("{rate}", String(bill.adjustmentRate))
        : null;
  return (
    <div className="flex items-start justify-between gap-2 border-divider border-b py-2 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium">{label}</p>
        <p className="mt-0.5 truncate text-[10px] text-text-muted">
          {[
            bill.billDateLabel,
            bill.units > 0 ? t("electricity.unit-count").replace("{n}", String(bill.units)) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[12px] font-medium tabular-nums">
          {rupees(bill.payable || bill.amount)}
        </p>
        <p className={`mt-0.5 text-[10px] ${bill.paid ? "text-text-muted" : "text-accent-mark"}`}>
          {bill.paid
            ? [t("electricity.paid-on").replace("{date}", bill.paidOnLabel ?? ""), note]
                .filter(Boolean)
                .join(" · ")
            : t("electricity.unpaid")}
        </p>
      </div>
    </div>
  );
}

/** Office, SC number and consumer id, checked with NEA before they're kept. */
function Setup({
  t,
  onSaved,
  onCancel,
  onRemoved,
}: {
  t: TFn;
  onSaved: (statement: ElectricityStatement) => void;
  /** Present once an account is saved: back to it without changes. */
  onCancel?: () => void;
  onRemoved: () => void;
}) {
  const { data: offices } = useSWR("nea-offices", () => catchAsFailed(api.neaOffices()));
  const list = loadedValue(offices) ?? [];
  const [office, setOffice] = useState("");
  const [sc, setSc] = useState("");
  const [consumer, setConsumer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      onSaved(await api.setNeaAccount({ officeCode: office, scNo: sc, consumerId: consumer }));
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
          <Icon name="bolt" className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold leading-snug">{t("electricity.setup-title")}</h2>
          <p className="mt-0.5 text-[11.5px] leading-snug text-text-secondary">
            {t("electricity.setup-body")}
          </p>
        </div>
      </div>

      <Select
        label={t("electricity.office-label")}
        value={office}
        onChange={setOffice}
        placeholder={list.length ? t("electricity.office-pick") : t("electricity.office-loading")}
        options={list.map((entry) => ({ id: entry.code, label: entry.name }))}
      />
      <label className="block">
        <span className={CONTROL_LABEL}>{t("electricity.sc-label")}</span>
        <input
          value={sc}
          maxLength={MAX_FIELD}
          onChange={(event) => setSc(event.target.value)}
          placeholder="101.02.003KA1GA"
          spellCheck={false}
          autoCapitalize="characters"
          className={CONTROL}
        />
      </label>
      <label className="block">
        <span className={CONTROL_LABEL}>{t("electricity.consumer-label")}</span>
        <input
          value={consumer}
          maxLength={MAX_FIELD}
          inputMode="numeric"
          onChange={(event) => setConsumer(event.target.value.replace(/\D/g, ""))}
          placeholder="100000001"
          className={CONTROL}
        />
      </label>
      <p className="text-[10px] leading-snug text-text-muted">{t("electricity.privacy")}</p>
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
          disabled={busy || !office || !sc.trim() || !consumer}
          className="settings-btn settings-btn--accent w-full justify-center"
        >
          {busy ? t("electricity.checking") : t("electricity.save")}
        </button>
      </div>
      {onCancel && (
        <button
          type="button"
          onClick={() => {
            api
              .clearNeaAccount()
              .then(onRemoved)
              .catch(() => {});
          }}
          className="text-[11px] text-text-muted hover:text-text-secondary"
        >
          {t("electricity.remove")}
        </button>
      )}
    </section>
  );
}
