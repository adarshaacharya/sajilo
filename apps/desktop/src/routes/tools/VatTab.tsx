import { useEffect, useState } from "react";
import { Card } from "../../components/Card";
import { Field, ResultRow } from "../../components/Field";
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
        // Grouped in Rust: lakh and crore are not something `Intl` can do.
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
    <div className="space-y-3">
      <Card>
        <Field label={t("tools.amount")} value={amount} onChange={setAmount} />
        <label className="mt-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={inclusive}
            onChange={(event) => setInclusive(event.target.checked)}
            className="accent-accent"
          />
          <span className="text-text-secondary">{t("tools.price-includes-vat")}</span>
        </label>
      </Card>

      {result && (
        <Card>
          <ResultRow label={t("tools.base-amount")} value={`Rs ${grouped.base ?? ""}`} />
          <ResultRow label={t("tools.vat-amount")} value={`Rs ${grouped.vat ?? ""}`} />
          <div className="mt-1 border-t border-border pt-1">
            <ResultRow label={t("tools.total")} value={`Rs ${grouped.total ?? ""}`} />
          </div>
          <p className="mt-2 text-[11px] text-text-muted">
            {/*
             * Spelled out because taking 13% of the *total* is the common
             * mistake, and it overstates the tax.
             */}
            {inclusive
              ? "VAT is the total less total ÷ 1.13 — not 13% of the total."
              : "13% of the amount before VAT."}
          </p>
        </Card>
      )}
    </div>
  );
}
