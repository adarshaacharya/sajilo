import type { translate } from "../../../shared/lib/i18n";
import type { MarketIndex } from "../../../types/api/StockMarketSnapshot";
import { money, money0 } from "../_lib/format";
import { ChangeBadge } from "./change-badge";

type TranslationKey = Parameters<typeof translate>[0];
type TFn = (key: TranslationKey) => string;

export function IndexHeadline({ index, t }: { index: MarketIndex; t: TFn }) {
  return (
    <section className="surface-card bazar-headline p-2.5">
      <div className="relative z-[1]">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-semibold text-text-secondary">{index.name}</p>
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
