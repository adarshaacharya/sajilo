import { useSettings } from "../../../shared/context/settings-context";
import type { FuelPriceSnapshot } from "../../../types/api/FuelPriceSnapshot";
import { fuelChange } from "../_lib/format";
import { FuelRow } from "./fuel-row";
import { SourceLink, SourceNote } from "./source-note";

export function FuelTab({ snapshot }: { snapshot: FuelPriceSnapshot }) {
  const { t } = useSettings();
  const effective = new Date(snapshot.effectiveFrom).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const unchanged = snapshot.prices.every((price) => Math.abs(fuelChange(price)) < 0.005);

  return (
    <div className="space-y-2.5">
      <section className="surface-card px-3 py-0.5">
        {snapshot.prices.map((price) => (
          <FuelRow key={price.fuel} price={price} />
        ))}
      </section>
      {unchanged && (
        <p className="px-0.5 text-[11px] text-text-secondary">{t("bazar.fuel-unchanged")}</p>
      )}

      <SourceNote label={t("bazar.effective-from")} stamp={effective}>
        <SourceLink href="https://noc.org.np/retailprice">Nepal Oil Corporation</SourceLink>
      </SourceNote>
    </div>
  );
}
