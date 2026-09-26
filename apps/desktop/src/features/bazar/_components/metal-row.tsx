import type { Metal } from "../../../types/api/Metal";
import type { MetalRate } from "../../../types/api/MetalRate";
import { metalName, metalNepaliName, metalUnitLabel, money, priceChange } from "../_lib/format";
import { ChangeBadge } from "./change-badge";

/** Gold reads as gold, silver as silver: a swatch, not the same coin icon on
 * every row. */
const SWATCH: Record<Metal, string> = {
  fineGold: "var(--color-accent-mark)",
  tejabiGold: "color-mix(in srgb, var(--color-accent-mark) 70%, var(--color-text-muted))",
  silver: "var(--color-text-secondary)",
};

/**
 * One metal, both of the units it is quoted in: per tola large, per 10 g
 * under it. A change shows only when there is one.
 */
export function MetalRow({
  metal,
  tola,
  tenGram,
}: {
  metal: Metal;
  tola: MetalRate | undefined;
  tenGram: MetalRate | undefined;
}) {
  const main = tola ?? tenGram;
  if (!main) return null;
  const other = main === tola ? tenGram : undefined;
  const change = priceChange(main.price, main.previousPrice);

  return (
    <div className="row-line flex items-center gap-2.5 py-2.5">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: SWATCH[metal] }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{metalName(metal)}</p>
        <p className="truncate text-[11px] text-text-muted">{metalNepaliName(metal)}</p>
      </div>
      {Math.abs(change) >= 0.005 && (
        <ChangeBadge change={change} previous={main.previousPrice} percentOnly />
      )}
      <div className="shrink-0 text-right">
        <p className="text-[15px] font-semibold leading-tight tabular-nums">
          Rs {money.format(main.price)}
          <span className="ml-1 text-[10px] font-normal text-text-muted">
            {metalUnitLabel(main.unit)}
          </span>
        </p>
        {other && (
          <p className="text-[11px] text-text-muted tabular-nums">
            Rs {money.format(other.price)} {metalUnitLabel(other.unit)}
          </p>
        )}
      </div>
    </div>
  );
}
