export function ChangeBadge({
  change,
  previous,
  percent,
  percentOnly = false,
}: {
  change: number;
  previous: number;
  /** The source's own published percent. Preferred over working it out here,
   *  which can round differently (25.55 on 2,559.49 is 0.998: the exchange
   *  publishes 0.99, recomputing shows 1.00). */
  percent?: number;
  percentOnly?: boolean;
}) {
  const flat = Math.abs(change) < 0.005;
  const up = change > 0;
  const shownPercent = percent ?? (previous > 0 ? (change / previous) * 100 : 0);
  const text = percentOnly
    ? `${up && !flat ? "+" : ""}${shownPercent.toFixed(2)}%`
    : flat
      ? "No change"
      : `${up ? "+" : ""}${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(change)}`;

  const tint = flat ? "text-text-muted" : up ? "text-positive" : "text-holiday";

  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${tint} ${
        flat
          ? ""
          : up
            ? "bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)]"
            : "bg-[color-mix(in_srgb,var(--color-holiday)_12%,transparent)]"
      }`}
    >
      {text}
    </span>
  );
}
