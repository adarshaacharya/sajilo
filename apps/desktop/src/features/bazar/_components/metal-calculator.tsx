import { useState } from "react";
import { CONTROL } from "../../../shared/components/control";
import { Select } from "../../../shared/components/select";
import { useSettings } from "../../../shared/context/settings-context";
import type { Metal } from "../../../types/api/Metal";
import type { MetalRateSnapshot } from "../../../types/api/MetalRateSnapshot";
import {
  availableMetals,
  metalName,
  metalWorth,
  money0,
  type WeightUnit,
  weightLabel,
} from "../_lib/format";

const WEIGHT_UNITS: WeightUnit[] = ["tola", "tenGram", "gram", "ounce"];

export function MetalCalculator({ snapshot }: { snapshot: MetalRateSnapshot }) {
  const { t } = useSettings();
  const metals = availableMetals(snapshot);
  const [amount, setAmount] = useState(1);
  const [metal, setMetal] = useState<Metal>(metals[0] ?? "fineGold");
  const [unit, setUnit] = useState<WeightUnit>("tola");

  const worth = metalWorth(snapshot, metal, amount, unit);

  return (
    <section className="surface-card p-2.5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {t("bazar.quantity")}
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)_72px_minmax(94px,1.15fr)] gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={Number.isFinite(amount) ? amount : ""}
          aria-label={t("bazar.quantity")}
          onChange={(event) => setAmount(Number(event.target.value))}
          className={`${CONTROL} min-w-0 w-full`}
        />
        <div className="min-w-0">
          <Select
            value={unit}
            onChange={setUnit}
            options={WEIGHT_UNITS.map((item) => ({ id: item, label: weightLabel(item) }))}
          />
        </div>
        <div className="min-w-0">
          <Select
            value={metal}
            onChange={setMetal}
            options={metals.map((item) => ({ id: item, label: metalName(item) }))}
          />
        </div>
      </div>
      <p className="mt-2 text-[16px] font-semibold tabular-nums">
        {worth != null ? `${t("bazar.worth")} Rs ${money0.format(worth)}` : "—"}
      </p>
    </section>
  );
}
