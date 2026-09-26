/**
 * Placeholder blocks drawn at the shape of the content that is coming.
 *
 * The point is the popover opening at its final height. A tray panel is opened
 * for a two-second glance, so a spinner — or the bare `…` the dashboard used to
 * show — costs the user the whole interaction: they read nothing, then the
 * layout jumps under the pointer when the data lands. Blocks sized like the
 * real rows mean the window is already the right size and the eye is already
 * in the right place.
 */
/** `current` tints from the text colour, for cards with their own background (the sky card). */
const TONES = {
  surface: "bg-surface-hover",
  current: "bg-[color-mix(in_srgb,currentColor_16%,transparent)]",
};
type Tone = keyof typeof TONES;

export function SkeletonBlock({
  className,
  tone = "surface",
}: {
  className?: string;
  tone?: Tone;
}) {
  return (
    <div className={`animate-pulse rounded ${TONES[tone]}${className ? ` ${className}` : ""}`} />
  );
}

/**
 * One line of placeholder text. The bar sits inside a block carrying the real
 * line's type classes, so the line is exactly as tall as the text it stands in
 * for, and a skeleton built from these lands at the loaded screen's height.
 */
export function SkeletonLine({
  className,
  bar = "w-3/5",
  tone = "surface",
}: {
  className?: string;
  bar?: string;
  tone?: Tone;
}) {
  return (
    <div className={className}>
      <span
        className={`inline-block h-[0.75em] animate-pulse rounded align-middle ${TONES[tone]} ${bar}`}
      />
    </div>
  );
}

/** A card-shaped placeholder — the same padding and radius as `surface-card`. */
export function SkeletonCard({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`surface-card p-2.5${className ? ` ${className}` : ""}`}>
      {children ?? (
        <div className="space-y-1.5">
          <SkeletonBlock className="h-3 w-4/5" />
          <SkeletonBlock className="h-2 w-2/5" />
        </div>
      )}
    </div>
  );
}

/** Repeated rows, for lists whose length is not known yet. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: rows }, (_, row) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder, never reordered
        <SkeletonCard key={row} />
      ))}
    </div>
  );
}
