import { Icon } from "../../../shared/components/icon";
import type { MetalRate } from "../../../types/api/MetalRate";
import { metalName, metalNepaliName, metalUnitLabel, money } from "../_lib/format";

export function MetalRow({ rate }: { rate: MetalRate }) {
  return (
    <div className="row-line flex items-center gap-2 py-2">
      <Icon name="gold" className="size-4 shrink-0 text-[color:var(--color-accent-mark)]" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{metalName(rate.metal)}</p>
        <p className="truncate text-[11px] text-text-muted">{metalNepaliName(rate.metal)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13px] font-medium tabular-nums">Rs {money.format(rate.price)}</p>
        <p className="text-[11px] text-text-muted">{metalUnitLabel(rate.unit)}</p>
      </div>
    </div>
  );
}
