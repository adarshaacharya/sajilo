import { useEffect, useState } from "react";
import { Card } from "../../components/Card";
import { Field, ResultRow } from "../../components/Field";
import { Select } from "../../components/Select";
import { api, type LandBreakdown, type LandUnit } from "../../lib/ipc";
import { useSettings } from "../../lib/settings";

/** Hill units first, then Terai, then the two everyone else uses. */
const UNITS: readonly { id: LandUnit; label: string }[] = [
  { id: "ropani", label: "Ropani" },
  { id: "aana", label: "Aana" },
  { id: "paisa", label: "Paisa" },
  { id: "daam", label: "Daam" },
  { id: "bigha", label: "Bigha" },
  { id: "kattha", label: "Kattha" },
  { id: "dhur", label: "Dhur" },
  { id: "squareFeet", label: "sq ft" },
  { id: "squareMetre", label: "m²" },
];

export function LandTab() {
  const { t } = useSettings();
  const [value, setValue] = useState(1);
  const [unit, setUnit] = useState<LandUnit>("ropani");
  const [result, setResult] = useState<LandBreakdown | null>(null);

  useEffect(() => {
    if (!Number.isFinite(value)) return;
    api
      .landBreakdown(value, unit)
      .then(setResult)
      .catch(() => setResult(null));
  }, [value, unit]);

  return (
    <div className="space-y-3">
      <Card>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("tools.area")} value={value} onChange={setValue} />
          <Select
            label={t("tools.unit")}
            value={unit}
            onChange={(next) => setUnit(next as LandUnit)}
            options={UNITS}
          />
        </div>
      </Card>

      {result && (
        <>
          {/*
           * Land is quoted compound — "2-3-1-0" — not as a decimal, so the
           * deed form leads and the raw areas follow.
           */}
          <Card title={t("tools.hill-system")}>
            <p className="mb-1 font-mono text-base">{result.hillCompact}</p>
            <p className="text-[11px] text-text-muted">ropani–aana–paisa–daam</p>
          </Card>
          <Card title={t("tools.terai-system")}>
            <p className="mb-1 font-mono text-base">{result.teraiCompact}</p>
            <p className="text-[11px] text-text-muted">bigha–kattha–dhur</p>
          </Card>
          <Card>
            <ResultRow label="sq ft" value={result.squareFeet.toFixed(2)} />
            <ResultRow label="m²" value={result.squareMetres.toFixed(2)} />
          </Card>
        </>
      )}
    </div>
  );
}
