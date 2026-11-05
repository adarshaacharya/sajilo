import { Reorder } from "motion/react";
import { useState } from "react";
import { AddCityField } from "../../../shared/components/city-results";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import {
  cityFor,
  flagFor,
  formatDayOffset,
  fullDateFor,
  useWorldClocks,
} from "../../../shared/lib/world-clock";

/** Six fills three tidy grid rows; past that the row out-heights the calendar
 * it sits above, and the full list is a tap away in Tools › Clock. */
const PREVIEW_LIMIT = 6;

export function ClockRow({ timeZones }: { timeZones: string[] }) {
  const { t, setModules } = useSettings();
  const preview = timeZones.slice(0, PREVIEW_LIMIT);
  const times = useWorldClocks(preview);
  const [adding, setAdding] = useState(false);

  if (preview.length === 0) return null;

  const remove = (tz: string) => {
    setModules((current) => ({
      ...current,
      clocks: current.clocks.filter((item) => item !== tz),
    }));
  };

  /**
   * The row only ever renders the first `PREVIEW_LIMIT` zones, so a reorder
   * rewrites that prefix and leaves the unshown tail where it was.
   */
  const reorder = (next: string[]) => {
    setModules((current) => ({
      ...current,
      clocks: [...next, ...current.clocks.slice(PREVIEW_LIMIT)],
    }));
  };

  const add = (tz: string) => {
    setModules((current) =>
      current.clocks.includes(tz) ? current : { ...current, clocks: [...current.clocks, tz] },
    );
    setAdding(false);
  };

  // An odd count leaves a free cell beside the last clock: adding happens
  // there, in the same line. An even count has none, so the + floats over the
  // grid's corner and the field opens under it.
  const freeCell = preview.length > 1 && preview.length % 2 === 1;
  const canAdd = preview.length < PREVIEW_LIMIT;
  const field = (chip: boolean) => (
    <AddCityField chip={chip} chosen={timeZones} onPick={add} onClose={() => setAdding(false)} />
  );

  return (
    <div className="group/clocks relative">
      <Reorder.Group
        as="div"
        axis="xy"
        values={preview}
        onReorder={reorder}
        className={`grid gap-1.5 pt-2 ${preview.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
      >
        {preview.map((tz) => {
          const city = cityFor(tz);
          const reading = times[tz];
          return (
            <Reorder.Item
              as="div"
              key={tz}
              value={tz}
              layout="position"
              dragElastic={0.15}
              whileDrag={{ scale: 1.03 }}
              title={fullDateFor(tz)}
              className="surface-card group relative flex cursor-grab touch-none select-none items-center gap-1.5 clock-chip px-2.5 py-1.5 text-[11px] active:cursor-grabbing"
            >
              <span className="shrink-0">{flagFor(tz)}</span>
              <span className="min-w-0 flex-1 truncate text-text-secondary">{city.city}</span>
              <span className="shrink-0 tabular-nums font-semibold">
                {reading?.time ?? "--:--"}
              </span>
              {reading && reading.dayOffset !== 0 && (
                <span className="shrink-0 tabular-nums text-[9px] font-semibold text-[color:var(--color-accent-mark)]">
                  {formatDayOffset(reading.dayOffset)}
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(tz)}
                aria-label={t("action.remove")}
                className="absolute -top-1 -right-1 z-10 flex size-4 items-center justify-center rounded-full border border-border bg-[color-mix(in_srgb,var(--color-text)_22%,var(--color-surface-raised))] text-[8px] leading-none text-text opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
              >
                ✕
              </button>
            </Reorder.Item>
          );
        })}
        {canAdd &&
          freeCell &&
          (adding ? (
            field(true)
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label={t("clock.add")}
              className="clock-add-cell opacity-0 transition-opacity group-hover/clocks:opacity-100 focus-visible:opacity-100"
            >
              <Icon name="plus" className="size-3" />
              {t("clock.add")}
            </button>
          ))}
      </Reorder.Group>
      {canAdd && !freeCell && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label={t("clock.add")}
          title={t("clock.add")}
          className="absolute -right-1 -bottom-1 z-10 flex size-4 items-center justify-center rounded-full border border-border bg-[color-mix(in_srgb,var(--color-text)_22%,var(--color-surface-raised))] text-text opacity-0 shadow-sm transition-opacity group-hover/clocks:opacity-100 focus-visible:opacity-100"
        >
          <Icon name="plus" className="size-2.5" />
        </button>
      )}
      {canAdd && !freeCell && adding && <div className="pt-1.5">{field(false)}</div>}
    </div>
  );
}
