import type { ReactNode } from "react";

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface-raised p-2.5">
      {title && (
        <h2 className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
