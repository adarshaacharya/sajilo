/**
 * Compact form controls — sized for a 380px popover, not a web form.
 *
 * macOS rounded-border fields are ~22px tall with sentence-case captions.
 * Shared everywhere so inputs line up in mixed rows.
 */
export const CONTROL =
  "control-field h-[22px] w-full rounded-[5px] px-1.5 text-[11px] leading-[1.4] text-text outline-none transition-[border-color,box-shadow] focus-visible:border-[color-mix(in_srgb,var(--color-accent-mark)_45%,transparent)] focus-visible:ring-1 focus-visible:ring-[color-mix(in_srgb,var(--color-accent-mark)_18%,transparent)]";

/** Caption above a control — sentence case, not shouty caps. */
export const CONTROL_LABEL = "mb-0.5 block text-[10px] leading-tight text-text-muted";
