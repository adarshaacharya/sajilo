import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import type { RashiSign } from "../../../types/api/RashiSign";
import { SIGNS } from "../_lib/signs";

/**
 * Signs as a 4-column grid of tiles: symbol, Nepali name, western name.
 * `matches`, when given, dims every sign outside it so a search reads at a
 * glance without reordering anything under the reader's finger. `onPin`,
 * when given, puts a star in each tile's corner: filled on the reader's own
 * rashi, and one tap on any other star makes that sign theirs.
 */
export function SignGrid({
  signs = SIGNS,
  pressed,
  matches,
  mine,
  onSelect,
  onPin,
}: {
  signs?: typeof SIGNS;
  pressed?: RashiSign | null;
  matches?: Set<RashiSign> | null;
  mine?: RashiSign | null;
  onSelect: (id: RashiSign) => void;
  onPin?: (id: RashiSign) => void;
}) {
  const { t } = useSettings();

  return (
    <div className="grid grid-cols-4 gap-1.5">
      {signs.map((sign) => {
        const hit = matches?.has(sign.id);
        const isMine = mine === sign.id;
        const state = matches ? (hit ? "rashi-tile--hit" : "rashi-tile--dim") : "";
        return (
          <div key={sign.id} className="rashi-tile-wrap">
            <button
              type="button"
              aria-pressed={pressed === undefined ? undefined : pressed === sign.id}
              onClick={() => onSelect(sign.id)}
              className={`rashi-tile w-full ${isMine ? "rashi-tile--mine" : ""} ${state}`}
            >
              <span className="rashi-tile__glyph" aria-hidden="true">
                {sign.glyph}
              </span>
              <span className="text-[12px] font-semibold leading-tight">{sign.ne}</span>
              <span className="text-[9px] leading-tight text-text-muted">{sign.western}</span>
            </button>
            {onPin &&
              (isMine ? (
                <span className="rashi-pin rashi-pin--on" title={t("rashifal.back-to-mine")}>
                  <Icon name="starFill" className="size-2.5" />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onPin(sign.id)}
                  aria-label={`${t("rashifal.set-mine")}: ${sign.ne}`}
                  title={t("rashifal.set-mine")}
                  className="rashi-pin"
                >
                  <Icon name="star" className="size-2.5" />
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
}
