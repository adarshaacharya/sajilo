import type { ReactNode } from "react";

/** Titled settings group — macOS Settings section header + glass card. */
export function SettingsSection({
  title,
  footnote,
  children,
}: {
  title: string;
  /** Text, or a fragment when part of it needs its own emphasis. */
  footnote?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-1 px-0.5 text-[10px] font-semibold text-text-muted">{title}</h2>
      <div className="surface-card space-y-2 p-2.5">
        {children}
        {footnote && <p className="text-[10px] leading-snug text-text-muted">{footnote}</p>}
      </div>
    </section>
  );
}
