import type { ReactNode } from "react";

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface-raised p-3">
      {title && (
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
