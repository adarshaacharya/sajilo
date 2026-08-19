import { money } from "../_lib/format";

export function RangeBar({
  title,
  low,
  high,
  position,
}: {
  title: string;
  low: number;
  high: number;
  position: number | null;
}) {
  return (
    <div>
      <p className="text-[10px] text-text-muted">{title}</p>
      <div className="relative mt-1 h-1.5 rounded-full bg-surface">
        {position != null && (
          <span
            className="absolute top-0 h-1.5 w-0.5 rounded-full bg-[color:var(--color-accent-mark)]"
            style={{ left: `calc(${position * 100}% - 1px)` }}
          />
        )}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-text-muted tabular-nums">
        <span>{money.format(low)}</span>
        <span>{money.format(high)}</span>
      </div>
    </div>
  );
}
