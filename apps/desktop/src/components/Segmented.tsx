import { type IconName, Icon } from "./Icon";

/**
 * macOS-style segmented control — one recessed track, raised pill on the
 * selected segment. Used for Settings / Bazar / Stocks movers.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  /** Optional SF Symbol name; a strip either labels every tab with one or none. */
  options: readonly { id: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="seg-track flex h-8 rounded-[9px] p-0.5"
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.id)}
            className={`flex h-full min-w-0 flex-1 items-center justify-center gap-1 rounded-[7px] px-1.5 text-[11px] font-medium transition-[background-color,color,box-shadow] duration-150 ${
              selected
                ? "seg-thumb text-text"
                : "text-text-secondary hover:text-text"
            }`}
          >
            {option.icon && (
              <Icon
                name={option.icon}
                className={`size-3 shrink-0 ${selected ? "text-[color:var(--color-accent-mark)]" : ""}`}
              />
            )}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
