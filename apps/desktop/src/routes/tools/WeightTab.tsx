import { useEffect, useState } from "react";
import { Card } from "../../components/Card";
import { Field, ResultRow } from "../../components/Field";
import { api, type WeightUnit } from "../../lib/ipc";
import { useSettings } from "../../lib/settings";

const UNITS: readonly { id: WeightUnit; label: string }[] = [
  { id: "tola", label: "Tola" },
  { id: "gram", label: "Gram" },
  { id: "tenGram", label: "10 g" },
  { id: "ounce", label: "Troy ounce" },
];

export function WeightTab() {
  const { t } = useSettings();
  const [value, setValue] = useState(1);
  const [unit, setUnit] = useState<WeightUnit>("tola");
  const [results, setResults] = useState<Partial<Record<WeightUnit, number>>>({});

  useEffect(() => {
    if (!Number.isFinite(value)) return;
    // Every unit at once: at a jeweller's counter the useful thing is the whole
    // row, not one conversion at a time.
    Promise.all(UNITS.map((target) => api.convertWeight(value, unit, target.id)))
      .then((converted) =>
        setResults(Object.fromEntries(UNITS.map((u, i) => [u.id, converted[i]]))),
      )
      .catch(() => setResults({}));
  }, [value, unit]);

  return (
    <div className="space-y-3">
      <Card>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("tools.weight")} value={value} onChange={setValue} />
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-text-muted">
              {t("tools.unit")}
            </span>
            <select
              value={unit}
              onChange={(event) => setUnit(event.target.value as WeightUnit)}
              className="w-full rounded-md border border-border bg-surface px-2 py-1 text-text outline-none focus:border-accent"
            >
              {UNITS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      <Card>
        {UNITS.filter((target) => target.id !== unit).map((target) => (
          <ResultRow
            key={target.id}
            label={target.label}
            value={(results[target.id] ?? 0).toFixed(4)}
          />
        ))}
      </Card>
    </div>
  );
}
