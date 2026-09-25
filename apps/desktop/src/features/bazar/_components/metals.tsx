import { Sparkline } from "../../../shared/components/sparkline";
import { useSettings } from "../../../shared/context/settings-context";
import type { MetalRateSnapshot } from "../../../types/api/MetalRateSnapshot";
import type { MetalSource } from "../../../types/api/MetalSource";
import {
  changePercent,
  headlineMetal,
  metalName,
  metalUnitLabel,
  money,
  priceChange,
  pricePerGram,
  sourceStamp,
} from "../_lib/format";
import { ChangeBadge } from "./change-badge";
import { MetalCalculator } from "./metal-calculator";
import { MetalRow } from "./metal-row";
import { SourceLink, SourceNote } from "./source-note";

/** Who published the prices on screen: the Federation, or the fallback that
 * answered when it was down. Proper names, so not translated. */
const CREDITS: Record<MetalSource, { href: string; name: string }> = {
  fenegosida: {
    href: "https://www.fenegosida.org/",
    name: "Federation of Nepal Gold and Silver Dealers' Association",
  },
  nepaliPatro: { href: "https://nepalipatro.com.np/", name: "Nepali Patro" },
  hamroPatro: { href: "https://www.hamropatro.com/gold", name: "Hamro Patro" },
};

export function MetalsTab({ snapshot }: { snapshot: MetalRateSnapshot }) {
  const { t } = useSettings();
  const credit = CREDITS[snapshot.source];
  const headline = headlineMetal(snapshot);
  const published = sourceStamp(snapshot.freshness);

  return (
    <div className="space-y-2.5">
      {headline && (
        <section className="surface-card p-2.5">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold text-text-secondary">
                  {metalName(headline.metal)}
                </p>
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
                        ? "text-positive"
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
        <SourceLink href={credit.href}>{credit.name}</SourceLink>
      </SourceNote>
    </div>
  );
}
