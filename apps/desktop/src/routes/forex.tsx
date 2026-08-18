import { useCallback, useEffect, useState } from "react";
import { Card } from "../components/Card";
import { Field } from "../components/Field";
import { Select } from "../components/Select";
import { StateBanner } from "../components/StateBanner";
import { api } from "../lib/ipc";
import { fetchedAtLabel, loadBanner, loadedValue } from "../lib/loadState";
import { useSettings } from "../lib/settings";
import type { ForexRate } from "../types/api/ForexRate";
import type { ForexSnapshot } from "../types/api/ForexSnapshot";
import type { LoadState } from "../types/api/LoadState";

const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function unitLabel(rate: ForexRate): string {
  return rate.unit === 1 ? rate.currencyCode : `${rate.currencyCode} (per ${rate.unit})`;
}

function buyPerUnit(rate: ForexRate): number {
  return rate.unit > 0 ? rate.buy / rate.unit : rate.buy;
}

function sellPerUnit(rate: ForexRate): number {
  return rate.unit > 0 ? rate.sell / rate.unit : rate.sell;
}

function RateRow({ rate }: { rate: ForexRate }) {
  return (
    <div className="row-line flex items-baseline justify-between gap-2 py-1.5">
      <div>
        <p className="font-medium">{rate.currencyCode}</p>
        <p className="text-[11px] text-text-muted">{rate.currencyName}</p>
      </div>
      <div className="text-right text-[11px]">
        <p>
          Buy {money.format(rate.buy)} · Sell {money.format(rate.sell)}
        </p>
        <p className="text-text-muted">{unitLabel(rate)}</p>
      </div>
    </div>
  );
}

export function Forex() {
  const { t, modules } = useSettings();
  const [state, setState] = useState<LoadState<ForexSnapshot>>();
  const [amount, setAmount] = useState(1);
  const [code, setCode] = useState("USD");
  const [reversed, setReversed] = useState(false);

  const load = useCallback((refresh = false) => {
    setState(undefined);
    api
      .getForex(refresh)
      .then(setState)
      .catch((error: unknown) => setState({ status: "failed", value: String(error) }));
  }, []);

  useEffect(() => load(), [load]);

  const snapshot = loadedValue(state);
  const banner = loadBanner(state, fetchedAtLabel(snapshot?.freshness));
  const selected = snapshot?.rates.find((rate) => rate.currencyCode === code) ?? snapshot?.rates[0];
  const favourites =
    snapshot?.rates.filter((rate) => modules.forexFavourites.includes(rate.currencyCode)) ?? [];

  const conversion =
    selected && Number.isFinite(amount)
      ? reversed
        ? `Rs ${money.format(amount)} = ${money.format(amount / sellPerUnit(selected))} ${selected.currencyCode}`
        : `${money.format(amount)} ${selected.currencyCode} = Rs ${money.format(amount * buyPerUnit(selected))}`
      : null;

  return (
    <div className="space-y-3">
      <Card>
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => load(true)}
            className="rounded px-2 py-0.5 text-[11px] text-text-secondary hover:bg-surface-hover"
          >
            {t("action.refresh")}
          </button>
        </div>
        <StateBanner state={banner} onRetry={() => load(true)}>
          {snapshot && selected && (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
                <Field label="Amount" value={amount} onChange={setAmount} />
                <Select
                  label="Currency"
                  value={selected.currencyCode}
                  onChange={setCode}
                  options={snapshot.rates.map((rate) => ({
                    id: rate.currencyCode,
                    label: rate.currencyCode,
                  }))}
                />
                <button
                  type="button"
                  onClick={() => setReversed((value) => !value)}
                  className="mb-0.5 rounded-xl border border-border px-2 py-1.5 text-text-secondary hover:bg-surface-hover"
                  aria-label={t("action.swap")}
                >
                  ⇅
                </button>
              </div>
              {conversion && <p className="text-lg font-semibold">{conversion}</p>}
              <p className="text-[11px] text-text-muted">
                {reversed
                  ? `At NRB sell rate, Rs ${money.format(selected.sell)} per ${unitLabel(selected)}`
                  : `At NRB buy rate, Rs ${money.format(selected.buy)} per ${unitLabel(selected)}`}
              </p>
            </div>
          )}
        </StateBanner>
      </Card>

      {favourites.length > 0 && (
        <Card title={t("forex.favourites")}>
          {favourites.map((rate) => (
            <RateRow key={rate.currencyCode} rate={rate} />
          ))}
        </Card>
      )}

      {snapshot && (
        <Card title={t("forex.all-currencies")}>
          {snapshot.rates.map((rate) => (
            <RateRow key={rate.currencyCode} rate={rate} />
          ))}
          {snapshot.publishedOn && (
            <p className="mt-2 text-[11px] text-text-muted">
              {t("bazar.published")}{" "}
              {new Date(snapshot.publishedOn).toLocaleString()}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
