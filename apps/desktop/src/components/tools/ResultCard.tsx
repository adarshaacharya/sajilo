import { useState } from "react";
import { Icon } from "../Icon";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard can fail in some webview contexts — still show feedback.
  }
}

/** Tap-to-copy result tile — matches Swift `ResultCard`. */
export function ResultCard({
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
      className="surface-card group flex w-full items-start gap-2 p-2 text-left transition-colors hover:bg-surface-hover"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-text-muted">{title}</p>
        <p className="mt-0.5 text-[15px] font-semibold leading-tight tabular-nums">{value}</p>
        {caption && <p className="mt-0.5 text-[10px] text-text-muted">{caption}</p>}
      </div>
      <Icon
        name={copied ? "checkmark" : "copy"}
        className={`mt-0.5 size-3 shrink-0 transition-colors ${
          copied ? "text-[color:var(--color-accent-mark)]" : "text-text-muted opacity-60 group-hover:opacity-100"
        }`}
      />
    </button>
  );
}
