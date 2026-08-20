import { FOREX_OPTIONS } from "../../../shared/context/settings-context";

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
      <div className="flex flex-wrap gap-1.5">
        {FOREX_OPTIONS.map((code) => {
          const on = selected.includes(code);
          return (
            <button
              key={code}
              type="button"
              title={NAMES[code] ?? code}
              aria-pressed={on}
              onClick={() => onToggle(code)}
              className={`toggle-chip ${on ? "toggle-chip--on" : "toggle-chip--off"}`}
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
