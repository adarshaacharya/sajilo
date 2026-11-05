import { type ReactNode, useMemo, useState } from "react";
import { useSettings } from "../context/settings-context";
import { LIMITS } from "../lib/limits";
import { type ClockCity, flagFor, searchTimezones } from "../lib/world-clock";
import { Icon } from "./icon";

/** Timezone search results, shared by Tools › Clock and Today's add-a-city
 * field. `onPick` gets the zone; `chosen` ticks the ones already shown. */
export function CityResults({
  results,
  chosen,
  onPick,
  empty,
  className = "max-h-[220px]",
}: {
  results: readonly ClockCity[];
  chosen: readonly string[];
  onPick: (timeZone: string) => void;
  empty: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`surface-card mt-1.5 divide-y divide-border/40 overflow-y-auto p-1 ${className}`}
    >
      {results.length === 0 && <p className="px-1.5 py-2 text-[11px] text-text-muted">{empty}</p>}
      {results.map((city) => {
        const on = chosen.includes(city.timeZone);
        return (
          <button
            key={city.timeZone}
            type="button"
            // Picked before the field's blur closes the list.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(city.timeZone)}
            className={`flex w-full items-center gap-2 px-1.5 py-2 text-left transition-colors ${
              on ? "text-[color:var(--color-accent-mark)]" : "hover:bg-surface-hover"
            }`}
          >
            <span className="text-[14px]">{flagFor(city.timeZone)}</span>
            <span className="min-w-0 flex-1 truncate text-[12px]">
              {city.city}
              <span className="ml-1 text-text-muted">· {city.region}</span>
            </span>
            {on && <span className="shrink-0 text-[11px]">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

/** One search field for adding a city, there only while one is being added;
 * picking one, Esc, or clicking away closes it. On Today under the clocks,
 * and in Settings under the clock switch. */
export function AddCityField({
  chosen,
  onPick,
  onClose,
  chip = false,
}: {
  chosen: readonly string[];
  onPick: (timeZone: string) => void;
  onClose: () => void;
  /** Sized as a clock chip, in a grid cell: the matches float below it
   * rather than pushing the row apart. */
  chip?: boolean;
}) {
  const { t } = useSettings();
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchTimezones(query), [query]);
  return (
    <div className={chip ? "relative" : undefined}>
      <div className={`day-plan-add field-shell is-typing${chip ? " day-plan-add--chip" : ""}`}>
        <Icon name="plus" className="size-3 shrink-0 text-accent-mark" />
        <input
          // biome-ignore lint/a11y/noAutofocus: opened by a click on purpose
          autoFocus
          value={query}
          maxLength={LIMITS.SEARCH}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }
            if (event.key === "Enter" && !event.nativeEvent.isComposing && results[0]) {
              onPick(results[0].timeZone);
            }
          }}
          onBlur={onClose}
          placeholder={t(chip ? "clock.add" : "clock.add-placeholder")}
          aria-label={t("clock.add")}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-text-muted"
        />
      </div>
      {query.trim() && (
        <CityResults
          results={results}
          chosen={chosen}
          onPick={onPick}
          empty={t("bazar.no-match")}
          className={
            chip
              ? "absolute top-full right-0 z-20 max-h-[160px] w-[200px] shadow-lg"
              : "max-h-[160px]"
          }
        />
      )}
    </div>
  );
}
