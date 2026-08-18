import { Icon } from "../../../shared/components/icon";
import type { VegetablePrice } from "../../../types/api/VegetablePrice";
import { marketUnitLabel, money } from "../_lib/format";

export function ProduceRow({
  price,
  pinned,
  onTogglePin,
}: {
  price: VegetablePrice;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  return (
    <div className="row-line group flex items-center gap-1.5 py-2">
      <button
        type="button"
        onClick={onTogglePin}
        aria-label="Pin to the top"
        className={`shrink-0 p-0.5 transition-opacity ${
          pinned
            ? "text-[color:var(--color-accent-mark)]"
            : "text-text-muted opacity-0 group-hover:opacity-100"
        }`}
      >
        <Icon name={pinned ? "pinFill" : "pin"} className="size-3" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px]">{price.name}</p>
        {price.englishName && (
          <p className="truncate text-[11px] text-text-muted">{price.englishName}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13px] font-medium tabular-nums">
          Rs {money.format(price.average)} {marketUnitLabel(price.unit)}
        </p>
        <p className="text-[11px] text-text-muted tabular-nums">
          {money.format(price.minimum)}–{money.format(price.maximum)}
        </p>
      </div>
    </div>
  );
}
