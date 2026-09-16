import type { TFn } from "../_lib/shared";

const CHOICES: readonly { days: number; label: string }[] = [
  { days: 365, label: "1y" },
  { days: 180, label: "6mo" },
  { days: 90, label: "3mo" },
  { days: 30, label: "30d" },
  { days: 14, label: "14d" },
  { days: 7, label: "7d" },
  { days: 3, label: "3d" },
  { days: 1, label: "1d" },
];

/** How far ahead to notify. `span` limits the choices to ones that fit the
 * thing — a monthly bill has no use for a one-year warning. */
export function RemindDays({
  value,
  onChange,
  span = 365,
  t,
}: {
  value: readonly number[];
  onChange: (days: number[]) => void;
  span?: number;
  t: TFn;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium text-text-secondary">
        {t("keeper.remind-before")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {[
          ...CHOICES.filter((choice) => choice.days <= span),
          { days: 0, label: t("keeper.on-the-day") },
        ].map(({ days, label }) => {
          const on = value.includes(days);
          return (
            <button
              key={days}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(
                  on
                    ? value.filter((entry) => entry !== days)
                    : [...value, days].sort((a, b) => b - a),
                )
              }
              className={`rounded-md border px-2 py-1 text-[10px] tabular-nums ${on ? "border-[color:var(--color-accent-mark)] bg-[color:color-mix(in_srgb,var(--color-accent-mark)_12%,transparent)] text-accent-mark" : "border-control-border text-text-muted hover:text-text"}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
