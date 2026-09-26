import type { FuelPrice } from "../../../types/api/FuelPrice";
import { fuelChange, fuelName, fuelNepaliName, fuelUnitLabel, money } from "../_lib/format";
import { ChangeBadge } from "./change-badge";

export function FuelRow({ price }: { price: FuelPrice }) {
  const change = fuelChange(price);
  return (
    <div className="row-line flex items-center gap-3 py-2.5">
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
      {Math.abs(change) >= 0.005 && <ChangeBadge change={change} previous={price.previousPrice} />}
    </div>
  );
}
