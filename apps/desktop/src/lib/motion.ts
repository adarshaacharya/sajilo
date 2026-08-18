/** Shared motion tokens — springy but restrained, like macOS. */
export const spring = {
  snappy: { type: "spring" as const, stiffness: 420, damping: 32, mass: 0.8 },
  gentle: { type: "spring" as const, stiffness: 280, damping: 28, mass: 0.9 },
  tab: { type: "spring" as const, stiffness: 520, damping: 38, mass: 0.75 },
};

export const easeOut = [0.22, 1, 0.36, 1] as const;

export const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
};

export const stagger = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.055, delayChildren: 0.04 },
  },
};

export function useMotionEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
