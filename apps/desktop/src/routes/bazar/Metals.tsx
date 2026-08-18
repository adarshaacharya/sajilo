import { useState } from "react";
import { ChangeBadge } from "../../components/bazar/ChangeBadge";
import { SourceLink, SourceNote } from "../../components/bazar/SourceNote";
import { CONTROL } from "../../components/control";
import { Icon } from "../../components/Icon";
import { Select } from "../../components/Select";
import { Sparkline } from "../../components/Sparkline";
import {
  availableMetals,
  changePercent,
  headlineMetal,
  metalName,
  metalNepaliName,
  metalUnitLabel,
  metalWorth,
  money,
  money0,
  priceChange,
  pricePerGram,
  sourceStamp,
  weightLabel,
  type WeightUnit,
} from "../../lib/bazar";
import { useSettings } from "../../lib/settings";
import type { Metal } from "../../types/api/Metal";
import type { MetalRate } from "../../types/api/MetalRate";
import type { MetalRateSnapshot } from "../../types/api/MetalRateSnapshot";

const WEIGHT_UNITS: WeightUnit[] = ["tola", "tenGram", "gram", "ounce"];

function MetalRow({ rate }: { rate: MetalRate }) {
  return (
    <div className="row-line flex items-center gap-2 py-2">
      <Icon name="gold" className="size-4 shrink-0 text-[color:var(--color-accent-mark)]" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{metalName(rate.metal)}</p>
        <p className="truncate text-[11px] text-text-muted">{metalNepaliName(rate.metal)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13px] font-medium tabular-nums">Rs {money.format(rate.price)}</p>
        <p className="text-[11px] text-text-muted">{metalUnitLabel(rate.unit)}</p>
      </div>
    </div>
  );
}

function MetalCalculator({ snapshot }: { snapshot: MetalRateSnapshot }) {
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
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={Number.isFinite(amount) ? amount : ""}
          aria-label={t("bazar.quantity")}
          onChange={(event) => setAmount(Number(event.target.value))}
          className={`${CONTROL} w-20 shrink-0`}
        />
        <div className="w-20 shrink-0">
          <Select
            value={unit}
            onChange={setUnit}
            options={WEIGHT_UNITS.map((item) => ({ id: item, label: weightLabel(item) }))}
          />
        </div>
        <div className="min-w-0 flex-1">
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

export function MetalsTab({ snapshot }: { snapshot: MetalRateSnapshot }) {
  const { t } = useSettings();
  const headline = headlineMetal(snapshot);
  const published = sourceStamp(snapshot.freshness);

  return (
    <div className="space-y-2.5">
      {headline && (
        <section className="surface-card bazar-headline p-2.5">
          <div className="relative z-[1]">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold text-text-secondary">{metalName(headline.metal)}</p>
                <p className="text-[10px] text-text-muted">{metalUnitLabel(headline.unit)}</p>
              </div>
              <ChangeBadge
                change={priceChange(headline.price, headline.previousPrice)}
                previous={headline.previousPrice}
                percentOnly
              />
            </div>
            <p className="mt-1 text-[32px] font-semibold leading-none tabular-nums">
              Rs {money.format(headline.price)}
            </p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <p className="text-[11px] text-text-muted tabular-nums">
                Rs {money.format(pricePerGram(headline))}/g
              </p>
              {snapshot.goldHistory.length >= 3 && (
                <div className="w-[88px] shrink-0">
                  <Sparkline
                    values={snapshot.goldHistory}
                    className={
                      changePercent(
                        priceChange(headline.price, headline.previousPrice),
                        headline.previousPrice,
                      ) >= 0
                        ? "text-[color:var(--color-accent-mark)]"
                        : "text-holiday"
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="surface-card p-2.5">
        {snapshot.rates.map((rate) => (
          <MetalRow key={`${rate.metal}-${rate.unit}`} rate={rate} />
        ))}
      </section>

      <MetalCalculator snapshot={snapshot} />

      <SourceNote label={t("bazar.published")} stamp={published}>
        <SourceLink href="https://www.fenegosida.org/">
          Federation of Nepal Gold and Silver Dealers&apos; Association
        </SourceLink>
      </SourceNote>
    </div>
  );
}
