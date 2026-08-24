import { useMemo, useState } from "react";
import { useSettings } from "../../../shared/context/settings-context";
import {
  cityFor,
  flagFor,
  formatDayOffset,
  fullDateFor,
  searchTimezones,
  useWorldClocks,
} from "../../../shared/lib/world-clock";

export function ClockTab() {
  const { t, modules, setModules } = useSettings();
  const [query, setQuery] = useState("");
  const times = useWorldClocks(modules.clocks);
  const results = useMemo(() => searchTimezones(query), [query]);

  /**
   * Adding a city here is what turns the dashboard row on.
   *
   * The row is gated on `clocksEnabled`, which defaults to false and is only
   * settable from Settings › Modules. So adding a city used to save it, list it
   * on this screen, and change nothing on Today — the feature looked broken
   * from the one place you would ever set it up. Picking a city is an
   * unambiguous request to see that city, so it enables the module too.
   */
  const toggle = (timeZone: string) => {
    setModules((current) => {
      const adding = !current.clocks.includes(timeZone);
      return {
        ...current,
        clocksEnabled: adding || current.clocksEnabled,
        clocks: adding
          ? [...current.clocks, timeZone]
          : current.clocks.filter((tz) => tz !== timeZone),
      };
    });
  };

  return (
    <div className="space-y-2.5">
      {modules.clocks.length > 0 && (
        <div className="surface-card divide-y divide-border/40 p-1">
          {modules.clocks.map((tz) => {
            const city = cityFor(tz);
            const reading = times[tz];
            return (
              <div key={tz} title={fullDateFor(tz)} className="flex items-center gap-2 px-1.5 py-2">
                <span className="text-[15px]">{flagFor(tz)}</span>
                <span className="min-w-0 flex-1 truncate text-[12px]">
                  {city.city}
                  <span className="ml-1 text-text-muted">· {city.region}</span>
                </span>
                <span className="tabular-nums text-[13px] font-medium">
                  {reading?.time ?? "--:--"}
                </span>
                {reading && reading.dayOffset !== 0 && (
                  <span className="tabular-nums text-[10px] font-semibold text-[color:var(--color-accent-mark)]">
                    {formatDayOffset(reading.dayOffset)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => toggle(tz)}
                  aria-label={t("action.remove")}
                  className="ml-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("tools.clock-search")}
          className="control-field w-full rounded-[8px] px-2.5 py-1.5 text-[12px] text-text outline-none focus-visible:border-[color-mix(in_srgb,var(--color-accent-mark)_45%,transparent)]"
        />
        {(query.trim() || results.length > 0) && (
          <div className="surface-card mt-1.5 max-h-[220px] divide-y divide-border/40 overflow-y-auto p-1">
            {results.length === 0 && (
              <p className="px-1.5 py-2 text-[11px] text-text-muted">{t("bazar.no-match")}</p>
            )}
            {results.map((city) => {
              const on = modules.clocks.includes(city.timeZone);
              return (
                <button
                  key={city.timeZone}
                  type="button"
                  onClick={() => toggle(city.timeZone)}
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
        )}
        {!query.trim() && results.length === 0 && (
          <p className="mt-1.5 px-0.5 text-[11px] text-text-muted">{t("tools.clock-hint")}</p>
        )}
      </div>
    </div>
  );
}
