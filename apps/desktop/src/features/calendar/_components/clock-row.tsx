import { cityFor, flagFor, useWorldClocks } from "../../../shared/lib/world-clock";

const PREVIEW_LIMIT = 4;

export function ClockRow({ timeZones }: { timeZones: string[] }) {
  const preview = timeZones.slice(0, PREVIEW_LIMIT);
  const times = useWorldClocks(preview);

  if (preview.length === 0) return null;

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
      {preview.map((tz) => {
        const city = cityFor(tz);
        return (
          <div
            key={tz}
            className="surface-card flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-[11px]"
          >
            <span>{flagFor(tz)}</span>
            <span className="text-text-secondary">{city.city}</span>
            <span className="tabular-nums font-semibold">{times[tz] ?? "--:--"}</span>
          </div>
        );
      })}
    </div>
  );
}
