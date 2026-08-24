import { useSettings } from "../../../shared/context/settings-context";
import type { RashiSign } from "../../../types/api/RashiSign";
import { SIGNS } from "../_lib/signs";

export function SignStrip({
  shown,
  mine,
  onSelect,
}: {
  shown: RashiSign | null;
  mine: RashiSign;
  onSelect: (id: RashiSign) => void;
}) {
  const { t } = useSettings();

  return (
    <section className="surface-card p-3">
      <p className="mb-2 text-[11px] font-semibold text-text-secondary">
        {t("rashifal.all-signs")}
      </p>
      <div className="grid grid-cols-4 gap-1">
        {SIGNS.map((entry) => {
          const selected = entry.id === shown;
          const owned = entry.id === mine;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelect(entry.id)}
              className={`rashifal-sign-cell ${selected ? "rashifal-sign-cell-active" : ""} ${
                owned && !selected ? "rashifal-sign-cell-mine" : ""
              }`}
            >
              {entry.ne}
            </button>
          );
        })}
      </div>
    </section>
  );
}
