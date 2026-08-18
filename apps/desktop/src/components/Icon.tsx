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
  rashifal: "M12.5 9.7A5 5 0 1 1 6.3 3.5a4 4 0 0 0 6.2 6.2M11.5 2.5v2M10.5 3.5h2",
  radio:
    "M4 8.5h8a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1M11 3 5.5 6M10.5 11.5h.01M5.5 11.5h1.5",
  display: "M2.5 3.5h11v7h-11zM6 13.5h4M8 10.5v3",
  modules: "M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z",
  system:
    "M5.5 5.5h5v5h-5zM6.5 2.5v3M9.5 2.5v3M6.5 10.5v3M9.5 10.5v3M2.5 6.5h3M2.5 9.5h3M10.5 6.5h3M10.5 9.5h3",
  upcoming: "M8 4v4l2.5 1.5M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12",
  festival: "M8 2.5 9.6 6l3.9.4-2.9 2.6.8 3.8L8 11l-3.4 1.8.8-3.8L2.5 6.4 6.4 6z",
  holiday: "M3 4.5h10v9H3zM3 7h10M5.5 2.5v2M10.5 2.5v2M6.3 10.2l1.2 1.2 2.4-2.4",
  land: "M2.5 4.5 6 3l4 1.5L13.5 3v8.5L10 13l-4-1.5-3.5 1.5zM6 3v8.5M10 4.5V13",
  weight: "M3 5.5h10l-1 8H4zM6 5.5a2 2 0 0 1 4 0M8 8v3M6.5 9.5h3",
  percent:
    "M4.6 5.6a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2M11.4 12.6a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2M12.5 3.5l-9 9",
  interest: "M2.5 11.5 6 8l2.5 2.5L13.5 5M10.5 5h3v3",
  settings:
    "M6.55 2.3h2.9l.3 1.55 1.05.6 1.5-.5 1.45 2.5-1.15 1.05v1.2l1.15 1.05-1.45 2.5-1.5-.5-1.05.6-.3 1.55h-2.9l-.3-1.55-1.05-.6-1.5.5L2.2 9.75l1.15-1.05v-1.2L2.2 6.45l1.45-2.5 1.5.5 1.05-.6zM8 9.9a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8",
} as const;
