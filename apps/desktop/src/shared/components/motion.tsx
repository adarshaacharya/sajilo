import { type HTMLMotionProps, motion } from "motion/react";
import type { ReactNode } from "react";
import { easeOut, fadeIn, fadeUp, spring, stagger, useMotionEnabled } from "../lib/motion";

type MotionDivProps = HTMLMotionProps<"div">;

/** Route / panel enter — short fade + lift. */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const enabled = useMotionEnabled();
  if (!enabled) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ ...spring.snappy, opacity: { duration: 0.18, ease: easeOut } }}
    >
      {children}
    </motion.div>
  );
}

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

export function FadeIn({ children, className }: { children: ReactNode; className?: string }) {
  const enabled = useMotionEnabled();
  if (!enabled) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      variants={fadeIn}
      transition={{ duration: 0.2, ease: easeOut }}
    >
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
