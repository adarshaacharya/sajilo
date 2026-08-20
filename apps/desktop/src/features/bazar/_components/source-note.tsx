import type { ReactNode } from "react";
import { openExternalLink } from "../../../shared/lib/external-link";

export function SourceNote({
  label,
  stamp,
  children,
}: {
  label: string;
  stamp?: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-0.5 text-[10px] text-text-muted">
      {stamp && (
        <p>
          {label} {stamp}
        </p>
      )}
      {children}
    </div>
  );
}

export function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => openExternalLink(href)}
      className="mt-0.5 block w-full whitespace-normal text-left text-[color:var(--color-accent-mark)] hover:underline"
    >
      {children}
    </button>
  );
}
