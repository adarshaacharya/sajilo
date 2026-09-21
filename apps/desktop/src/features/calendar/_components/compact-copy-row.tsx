import { useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import type { Conversion } from "../../../shared/lib/ipc";
import { COPY_FORMATS, type CopyFormat, copyText } from "../_lib/copy-formats";

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* webview may block clipboard */
  }
}

/** One chip per format, each showing the very text it copies. */
export function CompactCopyRow({ conversion }: { conversion: Conversion }) {
  const { t } = useSettings();
  const [copied, setCopied] = useState<CopyFormat | null>(null);

  const handleCopy = async (format: CopyFormat) => {
    await writeClipboard(copyText(format, conversion));
    setCopied(format);
    window.setTimeout(() => setCopied((current) => (current === format ? null : current)), 1400);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {COPY_FORMATS.map((format) => {
        const isCopied = copied === format;
        const value = copyText(format, conversion);
        return (
          <button
            key={format}
            type="button"
            aria-label={`${t("action.copy")} ${value}`}
            onClick={() => handleCopy(format)}
            className={`copy-chip tabular-nums ${isCopied ? "copy-chip-copied" : ""}`}
          >
            <Icon name={isCopied ? "checkmark" : "copy"} className="size-2.5" />
            <span>{value}</span>
          </button>
        );
      })}
    </div>
  );
}
