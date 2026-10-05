import { Icon } from "../../../shared/components/icon";
import type { ForexRate } from "../../../types/api/ForexRate";
import { formatAmount, unitLabel } from "../_lib/format";
import { ForexChart } from "./forex-chart";

/** A currency's buy and sell; tapping it opens its chart underneath. */
export function ForexRateRow({
  rate,
  open = false,
  onToggle,
}: {
  rate: ForexRate;
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="row-line">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-3 py-2 text-left"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[13px] font-medium">
            {unitLabel(rate)}
            <Icon
              name="chevronRight"
              className={`size-2.5 text-text-muted transition-transform ${open ? "rotate-90" : ""}`}
            />
          </p>
          <p className="truncate text-[11px] text-text-muted">{rate.currencyName}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[13px] font-medium tabular-nums">{formatAmount(rate.buy)}</p>
          <p className="text-[11px] text-text-muted tabular-nums">sell {formatAmount(rate.sell)}</p>
        </div>
      </button>
      {open && <ForexChart code={rate.currencyCode} />}
    </div>
  );
}
