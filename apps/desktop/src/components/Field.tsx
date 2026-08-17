/** A labelled numeric input. Numbers only — every tool here takes a quantity. */
export function Field({
  label,
  value,
  onChange,
  step = "any",
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
  min?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ""}
        step={step}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-text outline-none focus:border-accent"
      />
    </label>
  );
}

/** A label/value row, right-aligned so figures line up down the card. */
export function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-text-secondary">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
