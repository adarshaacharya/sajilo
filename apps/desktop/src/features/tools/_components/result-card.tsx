import type { ReactNode } from "react";
import { useState } from "react";
import { Icon } from "../../../shared/components/icon";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard can fail in some webview contexts — still show feedback.
  }
}

/** A single quiet surface for a tool's related, copyable outputs. */
export function ToolResults({ children }: { children: ReactNode }) {
  return (
    <section className="surface-card divide-y divide-border/55 overflow-hidden">{children}</section>
  );
}

/** One copyable result within a shared result surface. */
export function ToolResultRow({
  title,
  value,
  caption,
}: {
  title: string;
  value: string;
  caption?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="group flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-text-muted">{title}</p>
        <p className="mt-0.5 text-[14px] font-semibold leading-tight tabular-nums">{value}</p>
        {caption && <p className="mt-0.5 text-[10px] text-text-muted">{caption}</p>}
      </div>
      <Icon
        name={copied ? "checkmark" : "copy"}
        className={`mt-0.5 size-3.5 shrink-0 transition-colors ${
          copied
            ? "text-[color:var(--color-accent-mark)]"
            : "text-text-muted group-hover:text-text-secondary"
        }`}
      />
    </button>
  );
}
