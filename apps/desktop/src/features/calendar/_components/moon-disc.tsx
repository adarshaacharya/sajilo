/**
 * The moon as it looks tonight: the lit share of the disc, on the right while
 * it waxes and the left while it wanes. Drawn, not an emoji.
 */
export function MoonDisc({
  illumination,
  waxing,
  size = 14,
}: {
  illumination: number;
  waxing: boolean;
  size?: number;
}) {
  const r = 6;
  const lit = Math.min(1, Math.max(0, illumination));
  // The terminator is half an ellipse; its width shrinks to nothing at the
  // quarters and grows back to the full disc.
  const rx = Math.abs(1 - 2 * lit) * r;
  const bulgesIntoLight = lit < 0.5 ? 0 : 1;
  const path = `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${rx} ${r} 0 0 ${bulgesIntoLight} 0 ${-r} Z`;
  return (
    <svg width={size} height={size} viewBox="-7 -7 14 14" aria-hidden="true" className="shrink-0">
      <circle r={r} className="fill-[color:var(--color-surface-hover)]" />
      {lit > 0.01 && (
        <path
          d={path}
          transform={waxing ? undefined : "scale(-1 1)"}
          className="fill-[color:var(--color-text)]"
          opacity={0.92}
        />
      )}
      <circle r={r} fill="none" className="stroke-[color:var(--color-border)]" strokeWidth={0.6} />
    </svg>
  );
}
