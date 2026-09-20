import { useSettings } from "../../../shared/context/settings-context";
import type { StockPosition } from "../../../types/api/StockPosition";
import { money, money0 } from "../_lib/format";
import { signedMoney } from "../_lib/portfolio";
import { changeTone } from "../_lib/stock-tone";
import { FollowButton } from "./follow-button";

/**
 * One owned company inside the holdings card.
 *
 * The right column is always about the holding — what it is worth and what it
 * has made or lost — never the day's tick. Mixing the two in one column was
 * the old watchlist's worst habit: a price and a lifetime loss sat side by
 * side and read as one number.
 */
export function HoldingRow({
  position,
  onOpen,
  followed,
  onToggle,
}: {
  position: StockPosition;
  onOpen: () => void;
  followed: boolean;
  onToggle: () => void;
}) {
  const { t } = useSettings();
  const profit = position.unrealisedProfitLoss;
  return (
    <div className="row-line flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-surface-hover">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{position.symbol}</span>
          <span className="block truncate text-[10px] text-text-muted tabular-nums">
            {money0.format(position.quantity)} {t("stocks.portfolio-kitta")} ·{" "}
            {t("stocks.portfolio-average-short")} Rs {money.format(position.averageCost)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[13px] font-medium tabular-nums">
            {position.marketValue == null ? "—" : `Rs ${money.format(position.marketValue)}`}
          </span>
          <span className={`block text-[10px] font-medium tabular-nums ${changeTone(profit ?? 0)}`}>
            {profit == null
              ? "—"
              : `${signedMoney(profit)}${
                  position.unrealisedPercent == null
                    ? ""
                    : ` (${position.unrealisedPercent > 0 ? "+" : ""}${position.unrealisedPercent.toFixed(2)}%)`
                }`}
          </span>
        </span>
      </button>
      <FollowButton followed={followed} onToggle={onToggle} />
    </div>
  );
}
