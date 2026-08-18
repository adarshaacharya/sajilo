export function ChangeBadge({
  change,
  previous,
  percentOnly = false,
}: {
  change: number;
  previous: number;
  percentOnly?: boolean;
}) {
  const flat = Math.abs(change) < 0.005;
  const up = change > 0;
  const text = percentOnly
    ? `${up && !flat ? "+" : ""}${previous > 0 ? ((change / previous) * 100).toFixed(2) : "0.00"}%`
    : flat
      ? "No change"
      : `${up ? "+" : ""}${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(change)}`;

  const tint = flat
    ? "text-text-muted"
    : up
      ? "text-[color:var(--color-accent-mark)]"
      : "text-holiday";

  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${tint} ${
        flat ? "" : up ? "bg-[color-mix(in_srgb,var(--color-accent-mark)_12%,transparent)]" : "bg-[color-mix(in_srgb,var(--color-holiday)_12%,transparent)]"
      }`}
    >
      {text}
    </span>
  );
}
