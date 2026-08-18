/**
 * A 16px stroke glyph, drawn from a single path.
 *
 * Inline paths rather than an icon dependency: a handful of glyphs do not
 * justify a package, and `currentColor` is what lets an active state be one
 * class change on the parent.
 */
export function Icon({ path, className = "size-4" }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

/** The glyphs used in more than one place, so a tab and its screen agree. */
export const ICONS = {
  gold: "M8 2.5 10 6h4l-3 3 1 4.5L8 11.5 4 13.5 5 9 2 6h4z",
  fuel: "M4 13.5V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 10 4v9.5M3 13.5h8M4 7.5h6M12 6l1.5 1.5v4a1 1 0 0 1-2 0V5",
  vegetables:
    "M11 5.5c1.5 1.5 1.5 4.5-1 6.5s-5 1-6-1 0-4.5 2-5.5 3.5-1.5 5 0M9.5 4.5C10 3 11 2.5 12 2.5",
  search: "M7.25 11.5a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5M10.5 10.5 13.5 13.5",
} as const;
