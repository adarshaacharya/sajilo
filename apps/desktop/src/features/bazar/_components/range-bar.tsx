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
      {/* The track takes the border colour: the card's own surface colour
          would draw it invisibly, leaving the marker floating in space. The
          fill runs from the low to where the price sits. */}
      <div className="relative mt-1.5 h-1 rounded-full bg-[color:var(--color-border)]">
        {position != null && (
          <>
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-[color-mix(in_srgb,var(--color-accent-mark)_40%,transparent)]"
              style={{ width: `${clamp(position) * 100}%` }}
            />
            <span
              className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color:var(--color-surface-raised)] bg-[color:var(--color-accent-mark)]"
              style={{ left: `${clamp(position) * 100}%` }}
            />
          </>
        )}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-text-muted tabular-nums">
        <span>{money.format(low)}</span>
        <span>{money.format(high)}</span>
      </div>
    </div>
  );
}

function clamp(position: number): number {
  return Math.min(1, Math.max(0, position));
}
