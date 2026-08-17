import { useEffect, useState } from "react";
import { Card } from "../../components/Card";
import { Field, ResultRow } from "../../components/Field";
import { api, type InterestResult } from "../../lib/ipc";
import { useSettings } from "../../lib/settings";

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
        const [p, i, total] = await Promise.all([
          api.groupNumber(value.principal, 2),
          api.groupNumber(value.interest, 2),
          api.groupNumber(value.total, 2),
        ]);
        setGrouped({ principal: p, interest: i, total });
      })
      .catch(() => setResult(null));
  }, [principal, rate, years]);

  return (
    <div className="space-y-3">
      <Card>
        <Field label={t("tools.principal")} value={principal} onChange={setPrincipal} />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label={t("tools.rate-percent")} value={rate} onChange={setRate} step="0.01" />
          {/* Fractional terms are normal — half a year, eighteen months. */}
          <Field label={t("tools.years")} value={years} onChange={setYears} step="0.25" />
        </div>
      </Card>

      {result && (
        <Card>
          <ResultRow label={t("tools.principal")} value={`Rs ${grouped.principal ?? ""}`} />
          <ResultRow label={t("tools.interest-amount")} value={`Rs ${grouped.interest ?? ""}`} />
          <div className="mt-1 border-t border-border pt-1">
            <ResultRow label={t("tools.total")} value={`Rs ${grouped.total ?? ""}`} />
          </div>
          <p className="mt-2 text-[11px] text-text-muted">Simple interest — P × R × T ÷ 100.</p>
        </Card>
      )}
    </div>
  );
}
