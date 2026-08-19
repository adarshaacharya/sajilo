import type { VegetablePrice } from "../../../types/api/VegetablePrice";
import { ProduceRow } from "./produce-row";

export function ProduceList({
  title,
  prices,
  pins,
  onTogglePin,
}: {
  title?: string;
  prices: VegetablePrice[];
  pins: string[];
  onTogglePin: (name: string) => void;
}) {
  if (prices.length === 0) return null;
  return (
    <section className="surface-card p-2.5">
      {title && (
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          {title}
        </p>
      )}
      {prices.map((price) => (
        <ProduceRow
          key={price.name}
          price={price}
          pinned={pins.includes(price.name)}
          onTogglePin={() => onTogglePin(price.name)}
        />
      ))}
    </section>
  );
}
