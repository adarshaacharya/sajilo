import { type HTMLMotionProps, motion } from "motion/react";
import type { ReactNode } from "react";
import { fadeUp, spring, stagger, useMotionEnabled } from "../lib/motion";

type MotionDivProps = HTMLMotionProps<"div">;

/** Stagger children on mount (dashboard sections, lists). */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const enabled = useMotionEnabled();
  if (!enabled) return <div className={className}>{children}</div>;

  return (
    <motion.div className={className} variants={stagger} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function FadeUp({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const enabled = useMotionEnabled();
  if (!enabled) return <div className={className}>{children}</div>;

  return (
    <motion.div className={className} variants={fadeUp} transition={{ ...spring.gentle, delay }}>
      {children}
    </motion.div>
  );
}

/** Interactive card / row — subtle scale on press. */
export function Pressable({
  children,
  className,
  ...props
}: MotionDivProps & { children: ReactNode }) {
  const enabled = useMotionEnabled();
  if (!enabled) {
    return (
      <div className={className} {...(props as object)}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      whileHover={{ scale: 1.012, transition: spring.gentle }}
      whileTap={{ scale: 0.985, transition: spring.snappy }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export { motion };
