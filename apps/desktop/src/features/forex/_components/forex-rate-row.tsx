import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import type { ForexRate } from "../../../types/api/ForexRate";
import { formatAmount, unitLabel } from "../_lib/format";

/** A currency's buy and sell. Tapping it makes it the converter's currency,
 * and the chart above follows. The star beside it pins it to Favourites and
 * the Today screen: faint until the row is pointed at, unless it is pinned. */
export function ForexRateRow({
  rate,
  selected = false,
  onSelect,
}: {
  rate: ForexRate;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { t, modules, setModules } = useSettings();
  const code = rate.currencyCode;
  const favourite = modules.forexFavourites.includes(code);
  const toggle = () =>
    setModules((current) => ({
      ...current,
      forexFavourites: current.forexFavourites.includes(code)
        ? current.forexFavourites.filter((item) => item !== code)
        : [...current.forexFavourites, code],
    }));

  return (
    <div className="group row-line flex items-center gap-1.5 rounded-lg pl-2 pr-1 transition-colors hover:bg-[color:var(--color-surface-hover)]">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex min-w-0 flex-1 items-baseline justify-between gap-3 py-2 text-left"
      >
        <div className="min-w-0">
          <p
            className={`text-[13px] font-medium ${selected ? "text-[color:var(--color-forex-tint)]" : ""}`}
          >
            {unitLabel(rate)}
          </p>
          <p className="truncate text-[11px] text-text-muted">{rate.currencyName}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[13px] font-medium tabular-nums">{formatAmount(rate.buy)}</p>
          <p className="text-[11px] text-text-muted tabular-nums">sell {formatAmount(rate.sell)}</p>
        </div>
      </button>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={favourite}
        aria-label={`${t(favourite ? "forex.unfavourite" : "forex.favourite")} ${code}`}
        title={t(favourite ? "forex.unfavourite" : "forex.favourite")}
        className={`grid size-[22px] shrink-0 place-items-center rounded-md transition-opacity ${
          favourite
            ? "text-accent-mark"
            : "text-text-muted opacity-0 hover:text-text group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60"
        }`}
      >
        <Icon name={favourite ? "starFill" : "star"} className="size-3" />
      </button>
    </div>
  );
}
