import { useEffect, useState } from "react";
import { useSettings } from "../../../shared/context/settings-context";
import { api, type InterestResult } from "../../../shared/lib/ipc";
import { ToolSection } from "./quantity-row";
import { ToolResultRow, ToolResults } from "./result-card";
import { ToolNumberField } from "./tool-field";

export function InterestTab() {
  const { t } = useSettings();
  const [principal, setPrincipal] = useState(100000);
  const [rate, setRate] = useState(12);
  const [years, setYears] = useState(2);
  const [result, setResult] = useState<InterestResult | null>(null);
  const [grouped, setGrouped] = useState<Record<string, string>>({});

  useEffect(() => {
    if (![principal, rate, years].every(Number.isFinite)) return;
    api
      .computeInterest(principal, rate, years)
      .then(async (value) => {
        setResult(value);
        const [interest, total] = await Promise.all([
          api.groupNumber(value.interest, 2),
          api.groupNumber(value.total, 2),
        ]);
        setGrouped({ interest, total });
      })
      .catch(() => setResult(null));
  }, [principal, rate, years]);

  return (
    <ToolSection>
      <ToolNumberField label={t("tools.principal")} value={principal} onChange={setPrincipal} />
      <div className="flex items-end gap-2">
        <ToolNumberField
          label={t("tools.rate-percent")}
          value={rate}
          onChange={setRate}
          step="0.01"
          className="min-w-0 flex-1"
        />
        <ToolNumberField
          label={t("tools.years")}
          value={years}
          onChange={setYears}
          step="0.25"
          className="min-w-0 flex-1"
        />
      </div>

      {result && (
        <ToolResults>
          <ToolResultRow
            title={t("tools.interest-amount")}
            value={`Rs ${grouped.interest ?? ""}`}
          />
          <ToolResultRow title={t("tools.total")} value={`Rs ${grouped.total ?? ""}`} />
        </ToolResults>
      )}
    </ToolSection>
  );
}
