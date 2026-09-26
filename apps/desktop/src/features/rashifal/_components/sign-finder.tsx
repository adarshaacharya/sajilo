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
export function SignFinder({ onChoose }: { onChoose: (id: RashiSign) => void }) {
  const { t } = useSettings();
  const [query, setQuery] = useState("");
  const matches = query.trim() ? matchSigns(query) : null;
  const matched = matches ? SIGNS.filter((sign) => matches.has(sign.id)) : [];

  return (
    <section className="surface-card space-y-2.5 p-3">
      <h2 className="text-[13px] font-semibold">{t("rashifal.pick-sign")}</h2>

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

      <SignGrid matches={matches} onSelect={onChoose} />
    </section>
  );
}
