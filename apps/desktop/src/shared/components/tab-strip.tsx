import { motion } from "motion/react";
import { spring } from "../lib/motion";

type Tab<T extends string> = { id: T; label: string };

/**
 * Text tabs that switch what a single card shows.
 *
 * `Segmented` is for choosing a whole screen or mode; its recessed track reads
 * as a second card when drawn inside one. Here the labels sit on the card
 * itself and the choice is marked by a brighter label and a sliding underline.
 * The weight never changes, so switching tabs does not nudge the labels.
 */
export function TabStrip<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly Tab<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex items-stretch gap-4 overflow-x-auto border-b border-[color:var(--color-divider)] [scrollbar-width:none]"
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`relative shrink-0 whitespace-nowrap pb-2 pt-0.5 text-[11px] font-medium transition-colors duration-150 ${
              selected ? "text-text" : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {tab.label}
            {selected && (
              <motion.span
                layoutId={`tab-strip-${label}`}
                transition={spring.tab}
                className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[color:var(--color-accent-mark)]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
