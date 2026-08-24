import { useSyncExternalStore } from "react";

/** Shared motion tokens — springy but restrained, like macOS. */
export const spring = {
  snappy: { type: "spring" as const, stiffness: 420, damping: 32, mass: 0.8 },
  gentle: { type: "spring" as const, stiffness: 280, damping: 28, mass: 0.9 },
  tab: { type: "spring" as const, stiffness: 520, damping: 38, mass: 0.75 },
};

export const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export const stagger = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.055, delayChildren: 0.04 },
  },
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * Subscribes rather than sampling.
 *
 * Reading `matchMedia` during render answers once and then never again, so
 * turning the system setting on left every already-mounted screen animating
 * until it happened to remount — which, in a popover that is never torn down,
 * could be the rest of the session.
 */
export function useMotionEnabled(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") return () => {};
      const query = window.matchMedia(REDUCED_MOTION);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => (typeof window === "undefined" ? true : !window.matchMedia(REDUCED_MOTION).matches),
    () => true,
  );
}
