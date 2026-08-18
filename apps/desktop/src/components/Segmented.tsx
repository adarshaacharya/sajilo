import { Icon } from "./Icon";

/** A row of mutually exclusive choices — the tab strip pattern used throughout. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  /** `icon` is an optional 16px path; a strip either labels every tab with one or none. */
  options: readonly { id: T; label: string; icon?: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          // Same height as an input or select, so a tab strip above a form does
          // not sit on a different rhythm from the controls under it.
          className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-md border px-2 text-[11px] transition-colors ${
            value === option.id
              ? "border-accent bg-accent/10 text-accent"
              : "border-border text-text-secondary hover:bg-surface-hover"
          }`}
        >
          {option.icon && <Icon path={option.icon} className="size-3.5 shrink-0" />}
          <span className="truncate">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
