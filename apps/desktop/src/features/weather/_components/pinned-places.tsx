import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { placeLabel, usePlaces } from "../../../shared/lib/places";

/**
 * The pinned places as tabs, home first and marked with a house; the one on
 * screen is lit. Every tab but home closes with its ×: the home screen always
 * needs a place, so home changes first, with the house in the header.
 */
export function PinnedPlaces({
  pins,
  viewing,
  onView,
  onAdd,
  onRemove,
}: {
  pins: string[];
  viewing: string;
  onView: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const { t, language } = useSettings();
  const places = usePlaces();
  const home = pins[0];

  return (
    <section className="surface-card p-2" aria-label={t("weather.pinned")}>
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {pins.map((id) => {
          const active = id === viewing;
          const name = placeLabel(places, id, language);
          return (
            <div
              key={id}
              className={`flex shrink-0 items-center rounded-md text-[11px] font-medium transition-colors ${
                active
                  ? "bg-[color-mix(in_srgb,var(--color-weather-tint)_22%,transparent)] text-text"
                  : "bg-surface text-text-secondary hover:text-text"
              }`}
            >
              <button
                type="button"
                onClick={() => onView(id)}
                aria-current={active}
                className={`flex items-center gap-1 py-1 pl-2 ${id === home ? "pr-2" : "pr-1"}`}
              >
                {id === home && (
                  <Icon name="house" className="size-3 text-[color:var(--color-weather-tint)]" />
                )}
                {name}
              </button>
              {id !== home && (
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  aria-label={`${t("weather.unpin")} ${name}`}
                  className="flex h-full items-center rounded-r-md py-1 pr-1.5 pl-0.5 text-[10px] text-text-muted hover:text-text"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          aria-label={t("weather.add-place")}
          className="flex shrink-0 items-center gap-1 rounded-md bg-surface px-2 py-1 text-[11px] text-text-secondary hover:text-text"
        >
          <Icon name="plus" className="size-3" />
          {t("weather.add-place")}
        </button>
      </div>
    </section>
  );
}
