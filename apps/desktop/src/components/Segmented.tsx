import { motion } from "motion/react";
import { type IconName, Icon } from "./Icon";
import { spring } from "../lib/motion";

type Option<T extends string> = { id: T; label: string; icon?: IconName };

/**
 * macOS NSSegmentedControl — recessed track, sliding thumb.
 * Four or more segments scroll horizontally so labels are not truncated.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  scrollable,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  /** Default: scroll when there are 4+ segments. */
  scrollable?: boolean;
}) {
  const scroll = scrollable ?? options.length >= 4;

  return (
    <div
      role="tablist"
      aria-label={label}
      className={`seg-track flex h-[30px] rounded-[8px] p-[3px] ${scroll ? "seg-track--scroll" : ""}`}
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
            className={`seg-segment relative z-[1] flex h-full min-w-0 items-center justify-center gap-1 rounded-[6px] px-2.5 text-[11px] font-medium transition-colors duration-150 ${
              scroll ? "shrink-0" : "flex-1"
            } ${selected ? "text-text" : "text-text-secondary hover:text-text"}`}
          >
            {selected && (
              <motion.span
                layoutId={`seg-thumb-${label}`}
                className="seg-thumb absolute inset-0 rounded-[6px]"
                transition={spring.tab}
              />
            )}
            <span className="relative z-[1] flex min-w-0 items-center gap-1">
              {option.icon && (
                <Icon
                  name={option.icon}
                  className={`size-3 shrink-0 ${selected ? "text-[color:var(--color-accent-mark)]" : ""}`}
                />
              )}
              <span className={scroll ? "whitespace-nowrap" : "truncate"}>{option.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
