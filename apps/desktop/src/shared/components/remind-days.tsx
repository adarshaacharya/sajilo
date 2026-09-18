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

/** A compact multi-select for the days on which a deadline should notify. */
export function RemindDays({
  value,
  onChange,
  label,
  onDayLabel,
  span = 365,
}: {
  value: readonly number[];
  onChange: (days: number[]) => void;
  label: string;
  onDayLabel: string;
  span?: number;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium text-text-secondary">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {[...CHOICES.filter((choice) => choice.days <= span), { days: 0, label: onDayLabel }].map(
          ({ days, label: choiceLabel }) => {
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
                {choiceLabel}
              </button>
            );
          },
        )}
      </div>
    </div>
  );
}
