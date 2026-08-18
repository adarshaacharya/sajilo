import { useEffect, useState } from "react";
import { QuantityRow, ToolSection } from "../../components/tools/QuantityRow";
import { ResultCard } from "../../components/tools/ResultCard";
import { api, type WeightUnit } from "../../lib/ipc";
import { useSettings } from "../../lib/settings";

const UNITS: readonly { id: WeightUnit; label: string }[] = [
  { id: "tola", label: "Tola" },
  { id: "gram", label: "Gram" },
  { id: "tenGram", label: "10 g" },
  { id: "ounce", label: "Troy ounce" },
];

const NEPALI: Partial<Record<WeightUnit, string>> = {
  tola: "तोला",
  gram: "ग्राम",
  tenGram: "१० ग्राम",
  ounce: "औंस",
};

export function WeightTab() {
  const { t } = useSettings();
  const [value, setValue] = useState(1);
  const [unit, setUnit] = useState<WeightUnit>("tola");
  const [results, setResults] = useState<Partial<Record<WeightUnit, number>>>({});

  useEffect(() => {
    if (!Number.isFinite(value)) return;
    Promise.all(UNITS.map((target) => api.convertWeight(value, unit, target.id)))
      .then((converted) =>
        setResults(Object.fromEntries(UNITS.map((u, i) => [u.id, converted[i]]))),
      )
      .catch(() => setResults({}));
  }, [value, unit]);

  return (
    <ToolSection>
      <QuantityRow
        amountLabel={t("tools.amount")}
        amount={value}
        onAmountChange={setValue}
        unitLabel={t("tools.unit")}
        unit={unit}
        onUnitChange={(next) => setUnit(next as WeightUnit)}
        options={UNITS}
      />

      {UNITS.filter((target) => target.id !== unit).map((target) => (
        <ResultCard
          key={target.id}
          title={target.label}
          value={(results[target.id] ?? 0).toFixed(4)}
          caption={NEPALI[target.id]}
        />
      ))}
    </ToolSection>
  );
}
