import { useEffect, useMemo, useState } from "react";
import { BsDateField } from "../../../shared/components/bs-date-field";
import { CONTROL, CONTROL_LABEL } from "../../../shared/components/control";
import { Icon } from "../../../shared/components/icon";
import { Select } from "../../../shared/components/select";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import type { NepaliDate } from "../../../types/api/NepaliDate";
import type { StockAcquisitionSource } from "../../../types/api/StockAcquisitionSource";
import type { StockPortfolio } from "../../../types/api/StockPortfolio";
import type { StockPrice } from "../../../types/api/StockPrice";
import type { StockTradeEstimate } from "../../../types/api/StockTradeEstimate";
import type { StockTransaction } from "../../../types/api/StockTransaction";
import type { StockTransactionKind } from "../../../types/api/StockTransactionKind";
import { money, money0 } from "../_lib/format";

const SOURCES: StockAcquisitionSource[] = [
  "secondary",
  "ipoFpo",
  "rights",
  "bonus",
  "transfer",
  "other",
];

function validNumber(value: string, allowZero = false) {
  const number = Number(value);
  return Number.isFinite(number) && (allowZero ? number >= 0 : number > 0) ? number : null;
}

/**
 * The fields behind one purchase or sale.
 *
 * Purchase or sale is decided by the button that opened this form, so the form
 * never asks again — it is a screen with a title, not a mode switch.
 */
export function StockTransactionForm({
  symbol,
  initial,
  kind,
  marketPrice,
  prices,
  onSaved,
  onCancel,
}: {
  symbol: string;
  initial?: StockTransaction;
  kind: StockTransactionKind;
  /** Today's last traded price, offered as a one-tap fill for the price field. */
  marketPrice: number;
  prices: StockPrice[];
  onSaved: (portfolio: StockPortfolio) => void;
  onCancel: () => void;
}) {
  const { t } = useSettings();
  const [source, setSource] = useState<StockAcquisitionSource>(initial?.source ?? "secondary");
  const [tradeDate, setTradeDate] = useState(initial?.tradeDate ?? "");
  const [todayBs, setTodayBs] = useState<NepaliDate | null>(null);
  const [quantity, setQuantity] = useState(initial ? String(initial.quantity) : "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [manualFees, setManualFees] = useState(initial ? !initial.feesEstimated : false);
  const [fees, setFees] = useState(initial && !initial.feesEstimated ? String(initial.fees) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [expanded, setExpanded] = useState(Boolean(initial?.note || manualFees));
  const [estimate, setEstimate] = useState<StockTradeEstimate | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Nepal's today, not the browser's: between midnight and 05:45 NPT the UTC
  // date is still yesterday, which would leave today's own trade unselectable.
  useEffect(() => {
    const settle = (date: string) => setTradeDate((current) => current || date);
    api
      .today()
      .then((value) => {
        setTodayBs(value.nepali);
        settle(value.gregorian);
      })
      .catch(() => settle(new Date().toISOString().slice(0, 10)));
  }, []);

  const parsed = useMemo(() => {
    const units = validNumber(quantity);
    const rate = source === "bonus" && kind === "purchase" ? 0 : validNumber(price, true);
    const charge = manualFees ? validNumber(fees, true) : null;
    return {
      units: units != null && Number.isInteger(units) ? units : null,
      rate,
      charge,
      ready:
        Boolean(tradeDate) &&
        units != null &&
        Number.isInteger(units) &&
        rate != null &&
        (!manualFees || charge != null),
    };
  }, [fees, kind, manualFees, price, quantity, source, tradeDate]);

  useEffect(() => {
    if (!parsed.ready || parsed.units == null || parsed.rate == null) {
      setEstimate(null);
      setError("");
      return;
    }
    let cancelled = false;
    api
      .estimateStockTrade(
        initial?.id ?? null,
        symbol,
        kind,
        kind === "purchase" ? source : null,
        tradeDate,
        parsed.units,
        parsed.rate,
        manualFees ? parsed.charge : null,
      )
      .then((value) => {
        if (!cancelled) {
          setEstimate(value);
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setEstimate(null);
          setError(String(reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initial?.id, kind, manualFees, parsed, source, symbol, tradeDate]);

  const submit = async () => {
    if (!estimate || parsed.units == null || parsed.rate == null) return;
    setSaving(true);
    setError("");
    try {
      const portfolio = await api.saveStockTransaction(
        {
          id: initial?.id ?? crypto.randomUUID(),
          symbol,
          kind,
          source: kind === "purchase" ? source : null,
          tradeDate,
          quantity: parsed.units,
          price: parsed.rate,
          fees: manualFees ? parsed.charge : null,
          note,
        },
        prices,
      );
      onSaved(portfolio);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  const sourceLabel = (value: StockAcquisitionSource) =>
    t(`stocks.portfolio-source-${value}` as Parameters<typeof t>[0]);

  const bonusPurchase = kind === "purchase" && source === "bonus";

  return (
    <div className="mt-2.5">
      {/* Ordered the way a trade is entered: the two figures you type, then the
          date that is usually today, then the source that is usually the
          secondary market. */}
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={CONTROL_LABEL}>{t("stocks.portfolio-quantity")}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className={`${CONTROL} tabular-nums`}
            />
          </label>
          <label className="block">
            <span className="mb-0.5 flex items-baseline justify-between gap-2">
              <span className="text-[10px] leading-tight text-text-muted">
                {t("stocks.portfolio-price")}
              </span>
              {!bonusPurchase && (
                <button
                  type="button"
                  onClick={() => setPrice(String(marketPrice))}
                  title={t("stocks.portfolio-use-market-price")}
                  className="text-[10px] leading-tight font-medium text-accent-mark tabular-nums hover:underline"
                >
                  Rs {money.format(marketPrice)}
                </button>
              )}
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-1.5 -translate-y-1/2 text-[10px] text-text-muted">
                Rs
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                disabled={bonusPurchase}
                value={bonusPurchase ? "0" : price}
                onChange={(event) => setPrice(event.target.value)}
                className={`${CONTROL} pl-6 tabular-nums`}
              />
            </div>
          </label>
        </div>

        <BsDateField
          label={t("stocks.portfolio-date")}
          value={tradeDate}
          latest={todayBs}
          onChange={setTradeDate}
        />

        {kind === "purchase" && (
          <Select
            label={t("stocks.portfolio-source")}
            value={source}
            onChange={(value) => {
              setSource(value);
              if (value === "bonus") setPrice("0");
            }}
            options={SOURCES.map((value) => ({ id: value, label: sourceLabel(value) }))}
          />
        )}

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex items-center gap-1 text-[10px] font-medium text-text-secondary hover:text-text"
        >
          <Icon
            name="chevronDown"
            className={`size-2.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
          {t("stocks.portfolio-more")}
        </button>

        {expanded && (
          <div className="space-y-2 rounded-md bg-surface px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-text-secondary">
                {t("stocks.portfolio-charges")}
              </span>
              <button
                type="button"
                onClick={() => setManualFees((value) => !value)}
                className="text-[10px] font-medium text-accent-mark hover:underline"
              >
                {manualFees
                  ? t("stocks.portfolio-use-estimate")
                  : t("stocks.portfolio-enter-actual")}
              </button>
            </div>
            {manualFees && (
              <label className="block">
                <span className={CONTROL_LABEL}>{t("stocks.portfolio-actual-charges")}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={fees}
                  onChange={(event) => setFees(event.target.value)}
                  className={`${CONTROL} tabular-nums`}
                />
              </label>
            )}
            <label className="block">
              <span className={CONTROL_LABEL}>{t("stocks.portfolio-note")}</span>
              <input
                type="text"
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("stocks.portfolio-note-placeholder")}
                className={CONTROL}
              />
            </label>
          </div>
        )}

        {estimate && (
          <div className="section-divider space-y-1 pt-2 text-[10px]">
            <Summary label={t("stocks.portfolio-share-amount")} value={estimate.gross} />
            <Summary
              label={
                manualFees ? t("stocks.portfolio-charges") : t("stocks.portfolio-estimated-charges")
              }
              value={estimate.charges.total}
            />
            {kind === "sale" && (
              <Summary label={t("stocks.portfolio-estimated-tax")} value={estimate.tax} />
            )}
            <Summary
              strong
              label={
                kind === "purchase"
                  ? t("stocks.portfolio-total-paid")
                  : t("stocks.portfolio-net-received")
              }
              value={estimate.net}
            />
            {estimate.realisedProfitLoss != null && (
              <Summary
                label={t("stocks.portfolio-realised")}
                value={estimate.realisedProfitLoss}
                tone
              />
            )}
            {estimate.remainingQuantity != null && (
              <div className="flex justify-between gap-3 text-text-secondary">
                <span>{t("stocks.portfolio-remaining")}</span>
                <span className="tabular-nums">
                  {money0.format(estimate.remainingQuantity)} {t("stocks.portfolio-kitta")}
                </span>
              </div>
            )}
            <p className="pt-1 leading-snug text-text-muted">
              {t("stocks.portfolio-estimate-note")}
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-[10px] leading-snug text-holiday">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="settings-btn">
            {t("action.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!estimate || saving}
            className="settings-btn settings-btn--accent"
          >
            {saving ? t("stocks.portfolio-saving") : t("stocks.portfolio-save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  strong = false,
  tone = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
  tone?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-3 ${strong ? "font-semibold" : "text-text-secondary"}`}
    >
      <span>{label}</span>
      <span
        className={`tabular-nums ${tone ? (value >= 0 ? "text-positive" : "text-holiday") : ""}`}
      >
        {tone && value > 0 ? "+" : ""}Rs {money.format(value)}
      </span>
    </div>
  );
}
