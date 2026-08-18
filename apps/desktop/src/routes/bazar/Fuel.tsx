import { ChangeBadge } from "../../components/bazar/ChangeBadge";
import { SourceLink, SourceNote } from "../../components/bazar/SourceNote";
import { Icon } from "../../components/Icon";
import { fuelChange, fuelName, fuelNepaliName, fuelUnitLabel, money } from "../../lib/bazar";
import { useSettings } from "../../lib/settings";
import type { FuelPrice } from "../../types/api/FuelPrice";
import type { FuelPriceSnapshot } from "../../types/api/FuelPriceSnapshot";

function FuelRow({ price }: { price: FuelPrice }) {
  const change = fuelChange(price);
  return (
    <div className="row-line flex items-center gap-2.5 py-2.5">
      <Icon name="fuel" className="size-4 shrink-0 text-[color:var(--color-accent-mark)]" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{fuelName(price.fuel)}</p>
        <p className="truncate text-[11px] text-text-muted">{fuelNepaliName(price.fuel)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[18px] font-semibold leading-none tabular-nums">
          Rs {money.format(price.price)}
        </p>
        <p className="mt-0.5 text-[11px] text-text-muted">{fuelUnitLabel(price.fuel)}</p>
      </div>
      <ChangeBadge change={change} previous={price.previousPrice} />
    </div>
  );
}

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
