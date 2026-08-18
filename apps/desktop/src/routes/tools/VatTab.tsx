import { useEffect, useState } from "react";
import { Toggle } from "../../components/Toggle";
import { ToolSection } from "../../components/tools/QuantityRow";
import { ToolResultRow, ToolResults } from "../../components/tools/ResultCard";
import { ToolNumberField } from "../../components/tools/ToolField";
import { api, type VatBreakdown } from "../../lib/ipc";
import { useSettings } from "../../lib/settings";

export function VatTab() {
  const { t } = useSettings();
  const [amount, setAmount] = useState(1000);
  const [inclusive, setInclusive] = useState(false);
  const [result, setResult] = useState<VatBreakdown | null>(null);
  const [grouped, setGrouped] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!Number.isFinite(amount)) return;
    api
      .computeVat(amount, inclusive)
      .then(async (value) => {
        setResult(value);
        const [base, vat, total] = await Promise.all([
          api.groupNumber(value.base, 2),
          api.groupNumber(value.vat, 2),
          api.groupNumber(value.total, 2),
        ]);
        setGrouped({ base, vat, total });
      })
      .catch(() => setResult(null));
  }, [amount, inclusive]);

  return (
    <ToolSection>
      <ToolNumberField label={t("tools.amount")} value={amount} onChange={setAmount} />
      <Toggle label={t("tools.price-includes-vat")} checked={inclusive} onChange={setInclusive} />

      {result && (
        <ToolResults>
          <ToolResultRow title={t("tools.base-amount")} value={`Rs ${grouped.base ?? ""}`} />
          <ToolResultRow
            title={t("tools.vat-amount")}
            value={`Rs ${grouped.vat ?? ""}`}
            caption="13%"
          />
          <ToolResultRow title={t("tools.total")} value={`Rs ${grouped.total ?? ""}`} />
        </ToolResults>
      )}
    </ToolSection>
  );
}
