/**
 * The one definition of what a form control looks like.
 *
 * Inputs, selects and segmented buttons sat side by side at three different
 * heights because each styled itself. They share a height here so a row of
 * mixed controls lines up.
 */
export const CONTROL =
  "h-8 rounded-md border border-border/60 bg-surface-raised px-2 text-text outline-none transition-colors focus-visible:border-accent/70";

/** The caps label that sits above a control. */
export const CONTROL_LABEL = "mb-1 block text-[10px] uppercase tracking-wide text-text-muted";
