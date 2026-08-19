import { useSettings } from "../../../shared/context/settings-context";
import type { RashiSign } from "../../../types/api/RashiSign";
import { SIGNS } from "../_lib/signs";

export function SignFinder({
  highlight,
  onChoose,
}: {
  highlight: RashiSign | null;
  onChoose: (id: RashiSign) => void;
}) {
  const { t } = useSettings();

  return (
    <section className="surface-card p-3">
      <h2 className="text-[13px] font-semibold">{t("rashifal.pick-sign")}</h2>
      <p className="mt-0.5 mb-2.5 text-[11px] leading-snug text-text-secondary">
        {t("rashifal.pick-hint")}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {SIGNS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onChoose(entry.id)}
            className={`rashifal-pick-tile text-left ${
              entry.id === highlight ? "rashifal-pick-tile-active" : ""
            }`}
          >
            <span className="block text-[13px] font-semibold leading-tight">{entry.ne}</span>
            <span className="mt-0.5 block truncate text-[10px] text-text-muted">
              {entry.syllables.slice(0, 5).join(" ")}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
