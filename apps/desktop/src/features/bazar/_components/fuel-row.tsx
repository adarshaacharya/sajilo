import { useState } from "react";
import { useSettings } from "../../../shared/context/settings-context";
import type { FuelPrice } from "../../../types/api/FuelPrice";
import { fuelChange, fuelName, fuelNepaliName, fuelUnitLabel, money } from "../_lib/format";
import { ChangeBadge } from "./change-badge";
import { PriceChart } from "./price-chart";

/** Fewer revisions than this draw no chart: two points is a line, not a history. */
const MIN_CHART_POINTS = 3;

const shortDate = (time: number | string) =>
  new Date(typeof time === "number" ? time * 1000 : time).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** One fuel's price. Tapping it shows when it last changed, and every
 * revision NOC's records hold as a step chart. */
export function FuelRow({ price }: { price: FuelPrice }) {
  const { t } = useSettings();
  const [open, setOpen] = useState(false);
  const change = fuelChange(price);
  const moved = Math.abs(change) >= 0.005;
  const chartable = price.history.length >= MIN_CHART_POINTS;
  const first = price.history[0];

  return (
    <div className="row-line">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-2.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">{fuelName(price.fuel)}</p>
          <p className="truncate text-[11px] text-text-muted">{fuelNepaliName(price.fuel)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[18px] font-semibold leading-none tabular-nums">
            Rs {money.format(price.price)}
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">{fuelUnitLabel(price.fuel)}</p>
        </div>
        {/* Only a change is news; "No change" on every row was noise. The
            card says it once when nothing moved. */}
        {moved && <ChangeBadge change={change} previous={price.previousPrice} />}
      </button>

      {open && (
        <div className="pb-2.5">
          {price.changedOn && (
            <p className="text-[11px] text-text-secondary tabular-nums">
              {moved
                ? t("fuel.changed")
                    .replace("{date}", shortDate(price.changedOn))
                    .replace("{price}", money.format(price.previousPrice))
                : t("fuel.set").replace("{date}", shortDate(price.changedOn))}
            </p>
          )}
          {chartable && first && (
            <>
              <PriceChart
                points={price.history}
                offsetSeconds={0}
                span="year"
                steps
                formatPrice={(value) => `Rs ${money.format(value)}`}
                label={t("fuel.chart-label").replace("{fuel}", fuelName(price.fuel))}
              />
              <p className="mt-1 text-[10px] text-text-muted">
                {t("fuel.since")
                  .replace("{n}", String(price.history.length))
                  .replace("{date}", shortDate(first.time))}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
