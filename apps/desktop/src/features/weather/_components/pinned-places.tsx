import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { placeLabel, usePlaces } from "../../../shared/lib/places";

/**
 * The pinned places as chips, home first and marked with a house; the one on
 * screen is lit. Beneath them, what can be done with the place on screen:
 * pin it, or make it the one the home screen shows.
 */
export function PinnedPlaces({
  pins,
  viewing,
  onView,
  onAdd,
  onPin,
  onMakeHome,
}: {
  pins: string[];
  viewing: string;
  onView: (id: string) => void;
  onAdd: () => void;
  onPin: (id: string) => void;
  onMakeHome: (id: string) => void;
}) {
  const { t, language } = useSettings();
  const places = usePlaces();
  const home = pins[0];
  const pinned = pins.includes(viewing);

  return (
    <section className="surface-card p-2" aria-label={t("weather.pinned")}>
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {pins.map((id) => {
          const active = id === viewing;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onView(id)}
              aria-current={active}
              className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? "bg-[color-mix(in_srgb,var(--color-weather-tint)_22%,transparent)] text-text"
                  : "bg-surface text-text-secondary hover:text-text"
              }`}
            >
              {id === home && (
                <Icon name="house" className="size-3 text-[color:var(--color-weather-tint)]" />
              )}
              {placeLabel(places, id, language)}
            </button>
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

      <div className="mt-1.5 flex min-h-[20px] items-center gap-2 px-0.5 text-[10px] text-text-muted">
        {viewing === home ? (
          <span className="flex items-center gap-1">
            <Icon name="house" className="size-3" />
            {t("weather.home-place")}
          </span>
        ) : pinned ? (
          <button
            type="button"
            onClick={() => onMakeHome(viewing)}
            className="btn-ghost -ml-1.5 flex items-center gap-1 text-[10px] text-[color:var(--color-accent-mark)]"
          >
            <Icon name="house" className="size-3" />
            {t("weather.make-home")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onPin(viewing)}
            className="btn-ghost -ml-1.5 flex items-center gap-1 text-[10px] text-[color:var(--color-accent-mark)]"
          >
            <Icon name="pin" className="size-3" />
            {t("weather.pin")}
          </button>
        )}
      </div>
    </section>
  );
}
