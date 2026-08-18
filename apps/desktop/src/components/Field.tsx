import { ToolNumberField } from "./tools/ToolField";

/** A labelled numeric input — prefer `ToolNumberField` in new code. */
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
    <ToolNumberField label={label} value={value} onChange={onChange} step={step} min={min} />
  );
}

/** @deprecated Use the focused tools controls and `ToolResults` in tool routes. */
export function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-[11px] text-text-secondary">{label}</span>
      <span className="text-[11px] font-medium tabular-nums">{value}</span>
    </div>
  );
}
