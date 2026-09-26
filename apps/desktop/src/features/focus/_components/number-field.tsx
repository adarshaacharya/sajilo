import { useEffect, useState } from "react";
import { CONTROL } from "../../../shared/components/control";

/**
 * A number typed freely, saved when the field is left (or on Enter) rather
 * than on every key. The engine keeps it within range, and the field then
 * shows what was kept, so an out-of-range entry visibly snaps to the limit.
 */
export function NumberField({
  value,
  min,
  max,
  step,
  unit,
  label,
  onCommit,
}: {
  /** As shown in the field, in Latin digits: inputs take no other. */
  value: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  label: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const typed = Number.parseFloat(draft.replace(",", "."));
    if (Number.isFinite(typed) && typed > 0) onCommit(typed);
    else setDraft(value);
  };

  return (
    <span className="flex items-center gap-1.5">
      <input
        type="number"
        inputMode={step < 1 ? "decimal" : "numeric"}
        step={step}
        min={min}
        max={max}
        value={draft}
        aria-label={label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className={`${CONTROL} w-[52px] text-right tabular-nums`}
      />
      <span className="whitespace-nowrap text-[11px] text-text-secondary">{unit}</span>
    </span>
  );
}
