import type { ReactNode } from "react";

export function Card({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface-card p-2.5${className ? ` ${className}` : ""}`}>
      {title && (
        <h2 className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
