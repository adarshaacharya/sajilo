import { FOREX_OPTIONS, useSettings } from "../../../shared/context/settings-context";
import { digits } from "../../../shared/lib/numerals";

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

/**
 * Which currencies the Forex card shows: ten codes in an even grid, the
 * picked ones tinted rather than filled, and a small 1 on the one the
 * converter starts from, since the order they were picked in matters.
 */
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
  const { t, language } = useSettings();
  // Numbers inside a sentence follow the language, not the calendar's digits.
  const numerals = language === "ne" ? "devanagari" : "latin";
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-medium text-text-muted">{title}</p>
        <p className="text-[10px] text-text-muted tabular-nums">
          {t("settings.currencies-count")
            .replace("{n}", digits(selected.length, numerals))
            .replace("{total}", digits(FOREX_OPTIONS.length, numerals))}
        </p>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {FOREX_OPTIONS.map((code) => {
          const on = selected.includes(code);
          const first = selected[0] === code;
          return (
            <button
              key={code}
              type="button"
              title={NAMES[code] ?? code}
              aria-pressed={on}
              onClick={() => onToggle(code)}
              className={`currency-chip ${on ? "currency-chip--on" : ""}`}
            >
              {code}
              {first && (
                <span className="currency-chip__first" aria-hidden="true">
                  {digits(1, numerals)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-text-muted">{hint}</p>
    </div>
  );
}
