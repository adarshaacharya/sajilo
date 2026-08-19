/**
 * Compact form controls — sized for a 380px popover, not a web form.
 *
 * macOS rounded-border fields are ~22px tall with sentence-case captions.
 * Shared everywhere so inputs line up in mixed rows.
 */
export const CONTROL =
  "h-[22px] w-full rounded-[5px] border border-border/55 bg-[color-mix(in_srgb,var(--color-surface-raised)_88%,#000_12%)] px-1.5 text-[11px] leading-none text-text shadow-[inset_0_1px_0_color-mix(in_srgb,#fff_5%,transparent)] outline-none transition-[border-color,box-shadow] focus-visible:border-[color-mix(in_srgb,var(--color-accent-mark)_45%,transparent)] focus-visible:ring-1 focus-visible:ring-[color-mix(in_srgb,var(--color-accent-mark)_18%,transparent)]";

/** Caption above a control — sentence case, not shouty caps. */
export const CONTROL_LABEL = "mb-0.5 block text-[10px] leading-tight text-text-muted";
