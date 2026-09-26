import type { RashiSign } from "../../../types/api/RashiSign";
import { SIGNS } from "../_lib/signs";

/**
 * Signs as a 4-column grid of tiles: symbol, Nepali name, western name.
 * `matches`, when given, dims every sign outside it so a search reads at a
 * glance without reordering anything under the reader's finger.
 */
export function SignGrid({
  signs = SIGNS,
  pressed,
  matches,
  onSelect,
}: {
  signs?: typeof SIGNS;
  pressed?: RashiSign | null;
  matches?: Set<RashiSign> | null;
  onSelect: (id: RashiSign) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {signs.map((sign) => {
        const hit = matches?.has(sign.id);
        const state = matches ? (hit ? "rashi-tile--hit" : "rashi-tile--dim") : "";
        return (
          <button
            key={sign.id}
            type="button"
            aria-pressed={pressed === undefined ? undefined : pressed === sign.id}
            onClick={() => onSelect(sign.id)}
            className={`rashi-tile ${state}`}
          >
            <span className="rashi-tile__glyph" aria-hidden="true">
              {sign.glyph}
            </span>
            <span className="text-[12px] font-semibold leading-tight">{sign.ne}</span>
            <span className="text-[9px] leading-tight text-text-muted">{sign.western}</span>
          </button>
        );
      })}
    </div>
  );
}
