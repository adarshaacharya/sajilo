import { useId } from "react";
import { CONTROL, CONTROL_LABEL } from "./control";

/**
 * A labelled dropdown, matching `Field` in height and label treatment.
 *
 * Still a native `<select>`: it keeps keyboard and screen-reader behaviour for
 * free. Only the closed state is restyled — the popup is the OS's and should
 * look like it.
 */
export function Select<T extends string>({
  label,
  ariaLabel,
  value,
  onChange,
  options,
  groups,
}: {
  label?: string;
  /** For an unlabelled dropdown — a picker sitting in the header bar. */
  ariaLabel?: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { id: T; label: string }[];
  /** Rendered as `<optgroup>`s below `options`, for a long, sectioned list. */
  groups?: readonly { label: string; options: readonly { id: T; label: string }[] }[];
}) {
  const id = useId();
  const select = (
    <div className="relative">
      <select
        id={id}
        value={value}
        aria-label={label ? undefined : ariaLabel}
        onChange={(event) => onChange(event.target.value as T)}
        className={`${CONTROL} w-full cursor-pointer appearance-none pr-6 hover:bg-surface-hover`}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
        {groups?.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-1.5 size-2.5 -translate-y-1/2 text-text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m4.5 6.5 3.5-3 3.5 3M4.5 9.5l3.5 3 3.5-3" />
      </svg>
    </div>
  );

  if (!label) return select;
  return (
    <label className="block" htmlFor={id}>
      <span className={CONTROL_LABEL}>{label}</span>
      {select}
    </label>
  );
}
