import { useEffect, useState } from "react";
import { useSettings } from "../../../shared/context/settings-context";
import { api, type LandBreakdown, type LandUnit } from "../../../shared/lib/ipc";
import { QuantityRow, ToolSection } from "./quantity-row";
import { ToolResultRow, ToolResults } from "./result-card";

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
    <ToolSection>
      <QuantityRow
        amountLabel={t("tools.amount")}
        amount={value}
        onAmountChange={setValue}
        unitLabel={t("tools.unit")}
        unit={unit}
        onUnitChange={(next) => setUnit(next as LandUnit)}
        options={UNITS}
      />

      {result && (
        <ToolResults>
          <ToolResultRow
            title={t("tools.hill-system")}
            value={result.hillCompact}
            caption="रोपनी–आना–पैसा–दाम"
          />
          <ToolResultRow
            title={t("tools.terai-system")}
            value={result.teraiCompact}
            caption="बिघा–कठ्ठा–धुर"
          />
          <ToolResultRow
            title={t("tools.area")}
            value={`${result.squareFeet.toFixed(2)} sq ft · ${result.squareMetres.toFixed(2)} m²`}
          />
        </ToolResults>
      )}
    </ToolSection>
  );
}
