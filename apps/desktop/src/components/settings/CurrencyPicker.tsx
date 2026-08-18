import { FOREX_OPTIONS } from "../../lib/settings";

const NAMES: Record<string, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "Pound Sterling",
  AUD: "Australian Dollar",
  JPY: "Japanese Yen",
  INR: "Indian Rupee",
  CNY: "Chinese Yuan",
  SAR: "Saudi Riyal",
  QAR: "Qatari Riyal",
  SGD: "Singapore Dollar",
};

export function CurrencyPicker({
  title,
  hint,
  selected,
  onToggle,
}: {
  title: string;
  hint: string;
  selected: string[];
  onToggle: (code: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-medium text-text-muted">{title}</p>
      <div className="grid grid-cols-4 gap-1">
        {FOREX_OPTIONS.map((code) => {
          const on = selected.includes(code);
          return (
            <button
              key={code}
              type="button"
              title={NAMES[code] ?? code}
              onClick={() => onToggle(code)}
              className={`rounded-[6px] px-1 py-1 text-[10px] font-medium tabular-nums transition-colors ${
                on
                  ? "bg-[color-mix(in_srgb,var(--color-accent-mark)_88%,#000_12%)] text-[#1a1408] shadow-[inset_0_1px_0_color-mix(in_srgb,#fff_25%,transparent)]"
                  : "bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {code}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10px] text-text-muted">{hint}</p>
    </div>
  );
}
