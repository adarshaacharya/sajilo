import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { placeLabel, usePlaces } from "../../../shared/lib/places";

/**
 * The pinned places as chips, home first and marked with a house; the one on
 * screen is lit. Every chip but home closes with its ×: the home screen always
 * needs a place, so home changes first, from the sky card.
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
    <nav
      aria-label={t("weather.pinned")}
      className="-mx-0.5 flex gap-1.5 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {pins.map((id) => {
        const active = id === viewing;
        const name = placeLabel(places, id, language);
        return (
          <span key={id} className={`place-chip ${active ? "place-chip--on" : ""}`}>
            <button
              type="button"
              onClick={() => onView(id)}
              aria-current={active}
              className={`flex items-center gap-1 py-1 pl-2.5 ${id === home ? "pr-2.5" : "pr-1"}`}
            >
              {id === home && <Icon name="house" className="size-3" />}
              {name}
            </button>
            {id !== home && (
              <button
                type="button"
                onClick={() => onRemove(id)}
                aria-label={`${t("weather.unpin")} ${name}`}
                className="flex items-center self-stretch pr-2 pl-0.5 text-[10px] opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            )}
          </span>
        );
      })}
      <button type="button" onClick={onAdd} className="place-chip gap-1 px-2.5 py-1">
        <Icon name="plus" className="size-3" />
        {t("weather.add-place")}
      </button>
    </nav>
  );
}
