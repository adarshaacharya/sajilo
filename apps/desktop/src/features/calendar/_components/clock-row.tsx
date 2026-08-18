import { useSettings } from "../../../shared/context/settings-context";
import { cityFor, flagFor, useWorldClocks } from "../../../shared/lib/world-clock";

const PREVIEW_LIMIT = 4;

export function ClockRow({ timeZones }: { timeZones: string[] }) {
  const { t, setModules } = useSettings();
  const preview = timeZones.slice(0, PREVIEW_LIMIT);
  const times = useWorldClocks(preview);

  if (preview.length === 0) return null;

  const remove = (tz: string) => {
    setModules((current) => ({
      ...current,
      clocks: current.clocks.filter((item) => item !== tz),
    }));
  };

  return (
    <div className="flex gap-1.5 overflow-x-auto pt-2 pb-0.5">
      {preview.map((tz) => {
        const city = cityFor(tz);
        return (
          <div
            key={tz}
            className="surface-card group relative flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-[11px]"
          >
            <span>{flagFor(tz)}</span>
            <span className="text-text-secondary">{city.city}</span>
            <span className="tabular-nums font-semibold">{times[tz] ?? "--:--"}</span>
            <button
              type="button"
              onClick={() => remove(tz)}
              aria-label={t("action.remove")}
              className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border border-border bg-[color-mix(in_srgb,var(--color-text)_22%,var(--color-surface-raised))] text-[8px] leading-none text-text opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
