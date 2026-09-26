import { Icon, type IconName } from "./icon";
import { ScrollRow } from "./scroll-row";

export type FilterPillOption<T extends string> = {
  id: T;
  label: string;
  dot?: string;
  icon?: IconName;
};

function pillClass(active: boolean) {
  return `flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] whitespace-nowrap ${
    active
      ? "border-[color:var(--color-accent-mark)] bg-[color:color-mix(in_srgb,var(--color-accent-mark)_12%,transparent)] font-semibold text-accent-mark"
      : "border-[color:var(--color-border)] text-text-secondary hover:text-text"
  }`;
}

/** Horizontally scrolled filters — one tap each, no sliding thumb (avoids WebKit label flash). */
export function FilterPills<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly FilterPillOption<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <fieldset aria-label={label} className="min-w-0 border-0">
      <ScrollRow className="-mx-0.5 flex gap-1.5 px-0.5 pb-0.5">
        {options.map((option) => {
          const active = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.id)}
              className={pillClass(active)}
            >
              {option.dot && (
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: option.dot }}
                  aria-hidden="true"
                />
              )}
              {option.icon && (
                <Icon
                  name={option.icon}
                  className={`size-3 shrink-0 ${active ? "text-accent-mark" : "text-text-secondary"}`}
                />
              )}
              {option.label}
            </button>
          );
        })}
      </ScrollRow>
    </fieldset>
  );
}
