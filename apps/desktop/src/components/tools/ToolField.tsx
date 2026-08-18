import { CONTROL } from "../control";
import { ToolControl } from "./ToolControl";

export function ToolNumberField({
  label,
  value,
  onChange,
  step = "any",
  min = 0,
  className,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
  min?: number;
  className?: string;
}) {
  return (
    <ToolControl label={label} className={className}>
      <input
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ""}
        step={step}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        className={CONTROL}
      />
    </ToolControl>
  );
}

export function ToolTextField({
  label,
  value,
  onChange,
  className,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  min?: number;
  max?: number;
}) {
  return (
    <ToolControl label={label} className={className}>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className={CONTROL}
      />
    </ToolControl>
  );
}
