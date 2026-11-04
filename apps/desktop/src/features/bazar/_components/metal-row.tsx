import { useState } from "react";
import { useSettings } from "../../../shared/context/settings-context";
import type { Metal } from "../../../types/api/Metal";
import type { MetalRate } from "../../../types/api/MetalRate";
import { metalName, metalNepaliName, metalUnitLabel, money, priceChange } from "../_lib/format";
import { ChangeBadge } from "./change-badge";
import { AlertBell, AlertHint, AlertPanel } from "./price-alert";

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
  const { language } = useSettings();
  const [alerting, setAlerting] = useState(false);
  const main = tola ?? tenGram;
  if (!main) return null;
  const other = main === tola ? tenGram : undefined;
  const change = priceChange(main.price, main.previousPrice);
  const item = { kind: "metal", metal } as const;
  const name = language === "ne" ? metalNepaliName(metal) : metalName(metal);

  return (
    <div className="row-line py-2.5">
      <div className="flex items-center gap-2.5">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: SWATCH[metal] }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">
            {language === "ne" ? metalNepaliName(metal) : metalName(metal)}
          </p>
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
          <AlertHint item={item} price={tola?.price} />
        </div>
        {tola && (
          <AlertBell item={item} open={alerting} onToggle={() => setAlerting((was) => !was)} />
        )}
      </div>
      {alerting && (
        <AlertPanel
          item={item}
          name={`${name} (${metalUnitLabel("tola")})`}
          price={tola?.price}
          onClose={() => setAlerting(false)}
        />
      )}
    </div>
  );
}
