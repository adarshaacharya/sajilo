import { useMemo, useState } from "react";
import { BackButton } from "../../../shared/components/back-button";
import { CONTROL } from "../../../shared/components/control";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { districtName, placeName, searchPlaces, usePlaces } from "../../../shared/lib/places";
import type { Place } from "../../../types/api/Place";

/**
 * Every place weather can be shown for, searchable by town or district in
 * either script. Tapping a row shows its weather; the pin keeps it in the
 * strip above the forecast.
 */
export function PlacePicker({
  pins,
  onPick,
  onTogglePin,
  onBack,
}: {
  pins: string[];
  onPick: (id: string) => void;
  onTogglePin: (id: string) => void;
  onBack: () => void;
}) {
  const { t, language } = useSettings();
  const places = usePlaces();
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;

  // Browsing, the list reads east to west by province, the order the data
  // keeps; searching, the best matches come first instead.
  const groups = useMemo(() => {
    if (searching) return [{ label: null, places: searchPlaces(places, query) }];
    const byProvince = new Map<string, Place[]>();
    for (const place of places) {
      const label = language === "ne" ? place.provinceNe : place.province;
      byProvince.set(label, [...(byProvince.get(label) ?? []), place]);
    }
    return [...byProvince].map(([label, items]) => ({
      label,
      places: [...items].sort((a, b) =>
        placeName(a, language).localeCompare(placeName(b, language)),
      ),
    }));
  }, [places, query, searching, language]);

  const empty = groups.every((group) => group.places.length === 0);

  return (
    <div className="flex min-h-full flex-col gap-2.5 p-2.5">
      <div className="flex items-center gap-2">
        <BackButton onClick={onBack} />
        <p className="flex-1 text-[13px] font-semibold">{t("weather.places")}</p>
      </div>

      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("weather.search-places")}
          aria-label={t("weather.search-places")}
          className={`${CONTROL} w-full pl-7 text-[12px]`}
        />
      </div>

      <section className="surface-card p-2.5">
        {empty && <p className="text-[11px] text-text-secondary">{t("weather.no-place")}</p>}
        {groups.map(
          (group) =>
            group.places.length > 0 && (
              <div key={group.label ?? "results"} className={group.label ? "mt-2 first:mt-0" : ""}>
                {group.label && (
                  <p className="px-0.5 pb-0.5 text-[10px] font-semibold text-text-muted">
                    {group.label}
                  </p>
                )}
                {group.places.map((place) => {
                  const pinned = pins.includes(place.id);
                  const district = districtName(place, language);
                  const name = placeName(place, language);
                  return (
                    <div key={place.id} className="row-line flex items-center gap-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => onPick(place.id)}
                        className="flex min-w-0 flex-1 cursor-pointer flex-col rounded-md px-2 py-1 text-left transition-colors hover:bg-surface-hover"
                      >
                        <span className="truncate text-[13px] font-medium">{name}</span>
                        {district !== name && (
                          <span className="truncate text-[10px] text-text-muted">{district}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onTogglePin(place.id)}
                        // The last pin stays: the home screen always needs a place.
                        disabled={pinned && pins.length === 1}
                        aria-label={t(pinned ? "weather.unpin" : "weather.pin")}
                        aria-pressed={pinned}
                        className={`shrink-0 p-1 disabled:opacity-40 ${pinned ? "text-[color:var(--color-accent-mark)]" : "text-text-muted"}`}
                      >
                        <Icon name={pinned ? "pinFill" : "pin"} className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ),
        )}
      </section>
    </div>
  );
}
