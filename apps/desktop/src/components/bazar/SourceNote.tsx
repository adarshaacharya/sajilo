import type { ReactNode } from "react";

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

export function SourceLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          const { openUrl } = await import("@tauri-apps/plugin-opener");
          await openUrl(href);
        } catch {
          window.open(href, "_blank", "noopener,noreferrer");
        }
      }}
      className="mt-0.5 text-[color:var(--color-accent-mark)] hover:underline"
    >
      {children}
    </button>
  );
}
