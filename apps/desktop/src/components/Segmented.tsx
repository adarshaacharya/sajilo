/** A row of mutually exclusive choices — the tab strip pattern used throughout. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { id: T; label: string }[];
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
          className={`flex-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
            value === option.id
              ? "border-accent bg-accent/10 text-accent"
              : "border-border text-text-secondary hover:bg-surface-hover"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
