/**
 * Money as a statement you read downwards: what went in, what it is worth,
 * and the difference — each on its own line, labels left, figures right, in
 * one right-aligned column so the digits stack and the subtraction is visible.
 *
 * The grid of captioned figures this replaced asked the reader to hold four
 * terms at once and work out how they related. A holding is one sentence,
 * not a table: `StatementRow`s say it in the same label-left/value-right
 * voice every other row in Bazar already speaks.
 */
export function StatementRow({
  label,
  value,
  tone,
  strong = false,
  divided = false,
}: {
  label: string;
  value: string;
  /** Sign of the figure, when it should read as a gain or a loss. */
  tone?: number | null;
  /** The line the ones above it add up to. */
  strong?: boolean;
  divided?: boolean;
}) {
  const toneClass =
    tone == null || Math.abs(tone) < 0.005 ? "" : tone > 0 ? "text-positive" : "text-holiday";
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1 ${
        divided ? "section-divider mt-1 pt-1.5" : ""
      }`}
    >
      <span
        className={`shrink-0 ${strong ? "text-[11px] font-medium" : "text-[11px]"} text-text-secondary`}
      >
        {label}
      </span>
      <span
        className={`min-w-0 truncate text-right tabular-nums ${
          strong ? "text-[14px] font-semibold" : "text-[12px] font-medium"
        } ${toneClass}`}
      >
        {value}
      </span>
    </div>
  );
}
