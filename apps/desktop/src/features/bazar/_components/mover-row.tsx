import type { MarketMover } from "../../../types/api/StockMarketSnapshot";
import { money, money0 } from "../_lib/format";

export function MoverRow({ mover, onOpen }: { mover: MarketMover; onOpen: () => void }) {
  const isPercent = mover.board === "gainers" || mover.board === "losers";
  const up = mover.metric > 0;
  const flat = Math.abs(mover.metric) < 0.005;
  const tone = flat
    ? "text-text-muted"
    : up
      ? "text-[color:var(--color-accent-mark)]"
      : "text-holiday";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="row-line flex w-full items-center gap-2 py-1.5 text-left"
    >
      <span className="w-[68px] shrink-0 text-[11px] font-semibold">{mover.symbol}</span>
      <span className="text-[11px] text-text-muted tabular-nums">Rs {money.format(mover.ltp)}</span>
      <span
        className={`ml-auto text-[11px] font-medium tabular-nums ${isPercent ? tone : "text-text-secondary"}`}
      >
        {isPercent
          ? `${up && !flat ? "+" : ""}${mover.metric.toFixed(2)}%`
          : mover.board === "turnover"
            ? `Rs ${money0.format(mover.metric)}`
            : money0.format(mover.metric)}
      </span>
    </button>
  );
}
