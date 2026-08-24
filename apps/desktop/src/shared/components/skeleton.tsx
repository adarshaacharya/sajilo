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
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-surface-hover${className ? ` ${className}` : ""}`}
    />
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
