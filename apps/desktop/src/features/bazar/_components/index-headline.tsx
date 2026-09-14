import type { translate } from "../../../shared/lib/i18n";
import type { MarketIndex } from "../../../types/api/MarketIndex";
import type { MarketStatus } from "../../../types/api/MarketStatus";
import { money, money0 } from "../_lib/format";
import { ChangeBadge } from "./change-badge";

type TranslationKey = Parameters<typeof translate>[0];
type TFn = (key: TranslationKey) => string;

export function IndexHeadline({
  index,
  marketStatus,
  t,
}: {
  index: MarketIndex;
  marketStatus: MarketStatus | null;
  t: TFn;
}) {
  return (
    <section className="surface-card p-2.5">
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-[11px] font-semibold text-text-secondary">{index.name}</p>
            {marketStatus && <MarketStatusChip isOpen={marketStatus.isOpen} t={t} />}
          </div>
          <ChangeBadge change={index.change} previous={index.value - index.change} percentOnly />
        </div>
        <p className="mt-1 text-[28px] font-semibold leading-none tabular-nums">
          {money.format(index.value)}
        </p>
        <p className="mt-1.5 text-[11px] text-text-muted tabular-nums">
          {t("bazar.market-turnover")} · Rs {money0.format(index.turnover)}
        </p>
      </div>
    </section>
  );
}

/** Sits beside the index name: a breathing dot while trading, a quiet grey
 *  one after hours, so "closed" reads as a normal state rather than an error. */
function MarketStatusChip({ isOpen, t }: { isOpen: boolean; t: TFn }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${
        isOpen
          ? "bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] text-positive"
          : "bg-surface-hover text-text-muted"
      }`}
    >
      {isOpen ? (
        <span
          className="live-status-dot [--live-dot-color:var(--color-positive)]"
          aria-hidden="true"
        />
      ) : (
        <span className="size-1.5 rounded-full bg-text-muted/60" aria-hidden="true" />
      )}
      {isOpen ? t("stocks.market-open") : t("stocks.market-closed")}
    </span>
  );
}
