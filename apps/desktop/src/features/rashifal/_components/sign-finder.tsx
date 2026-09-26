import { useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import type { RashiSign } from "../../../types/api/RashiSign";
import { matchSigns, SIGNS } from "../_lib/signs";
import { SignGrid } from "./sign-grid";

/**
 * Picking a rashi: type the start of a name and the grid dims every sign it
 * can't belong to, with the matching syllables spelled out under the box.
 */
export function SignFinder({
  current,
  onChoose,
  onCancel,
}: {
  current: RashiSign | null;
  onChoose: (id: RashiSign) => void;
  /** Present when a rashi is already saved, to go back without changing it. */
  onCancel?: () => void;
}) {
  const { t } = useSettings();
  const [query, setQuery] = useState("");
  const matches = query.trim() ? matchSigns(query) : null;
  const matched = matches ? SIGNS.filter((sign) => matches.has(sign.id)) : [];

  return (
    <section className="surface-card space-y-2.5 p-3">
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-[13px] font-semibold">{t("rashifal.pick-sign")}</h2>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn-ghost shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-accent-mark"
          >
            {t("action.cancel")}
          </button>
        )}
      </div>

      <label className="rashi-search">
        <Icon name="search" className="size-3.5 shrink-0 text-text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            const [only] = matched;
            if (event.key === "Enter" && only && matched.length === 1) onChoose(only.id);
          }}
          placeholder={t("rashifal.search-placeholder")}
          aria-label={t("rashifal.search-placeholder")}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-muted"
        />
      </label>

      <p className="min-h-[16px] text-[11px] leading-snug text-text-secondary" aria-live="polite">
        {!matches
          ? t("rashifal.pick-hint")
          : matched.length === 0
            ? t("rashifal.no-match")
            : matched.map((sign) => `${sign.ne}: ${sign.syllables.join(" ")}`).join(" · ")}
      </p>

      <SignGrid pressed={current} matches={matches} onSelect={onChoose} />
    </section>
  );
}
