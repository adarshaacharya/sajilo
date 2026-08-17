import { CONTROL, CONTROL_LABEL } from "./control";

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
      <span className={CONTROL_LABEL}>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ""}
        step={step}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`${CONTROL} w-full`}
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
