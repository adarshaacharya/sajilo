import { useSettings } from "../../../shared/context/settings-context";
import type { FuelPriceSnapshot } from "../../../types/api/FuelPriceSnapshot";
import { FuelRow } from "./fuel-row";
import { SourceLink, SourceNote } from "./source-note";

export function FuelTab({ snapshot }: { snapshot: FuelPriceSnapshot }) {
  const { t } = useSettings();
  const effective = new Date(snapshot.effectiveFrom).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="space-y-2.5">
      <section className="surface-card p-2.5">
        {snapshot.prices.map((price) => (
          <FuelRow key={price.fuel} price={price} />
        ))}
      </section>

      <SourceNote label={t("bazar.effective-from")} stamp={effective}>
        <SourceLink href="https://noc.org.np/retailprice">Nepal Oil Corporation</SourceLink>
      </SourceNote>
    </div>
  );
}
