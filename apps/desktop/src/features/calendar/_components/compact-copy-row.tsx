import { useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import type { Conversion } from "../../../shared/lib/ipc";
import type { NumeralStyle } from "../../../shared/lib/numerals";
import { COPY_FORMATS, type CopyFormat, copyShortLabel, copyText } from "../_lib/copy-formats";

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* webview may block clipboard */
  }
}

export function CompactCopyRow({
  conversion,
  numerals,
}: {
  conversion: Conversion;
  numerals: NumeralStyle;
}) {
  const { t } = useSettings();
  const [copied, setCopied] = useState<CopyFormat | null>(null);

  const handleCopy = async (format: CopyFormat) => {
    await writeClipboard(copyText(format, conversion, numerals));
    setCopied(format);
    window.setTimeout(() => setCopied((current) => (current === format ? null : current)), 1400);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] text-text-muted">{t("action.copy-as")}</span>
      {COPY_FORMATS.map((format) => {
        const isCopied = copied === format;
        const value = copyText(format, conversion, numerals);
        return (
          <button
            key={format}
            type="button"
            title={value}
            aria-label={`${copyShortLabel(format)}: ${value}`}
            onClick={() => handleCopy(format)}
            className={`copy-chip ${isCopied ? "copy-chip-copied" : ""}`}
          >
            <Icon name={isCopied ? "checkmark" : "copy"} className="size-2.5" />
            <span>{copyShortLabel(format)}</span>
          </button>
        );
      })}
    </div>
  );
}
