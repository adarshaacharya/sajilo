import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import type { translate } from "../../../shared/lib/i18n";
import type { IndexIntraday } from "../../../types/api/IndexIntraday";
import type { LoadState } from "../../../types/api/LoadState";
import type { MarketBreadth } from "../../../types/api/MarketBreadth";
import type { MarketIndex } from "../../../types/api/MarketIndex";
import type { MarketStatus } from "../../../types/api/MarketStatus";
import { money, money0 } from "../_lib/format";
import { nepalToday } from "../_lib/ipo";
import { ChangeBadge } from "./change-badge";
import { IndexChart } from "./index-chart";

type TranslationKey = Parameters<typeof translate>[0];
type TFn = (key: TranslationKey) => string;

export function IndexHeadline({
  index,
  marketStatus,
  breadth,
  intraday,
  onRetryIntraday,
  t,
}: {
  index: MarketIndex;
  marketStatus: MarketStatus | null;
  breadth: MarketBreadth | null;
  intraday: LoadState<IndexIntraday> | undefined;
  onRetryIntraday: () => void;
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
          <ChangeBadge
            change={index.change}
            previous={index.value - index.change}
            percent={index.changePercent}
            percentOnly
          />
        </div>
        <p className="mt-1 text-[28px] font-semibold leading-none tabular-nums">
          {money.format(index.value)}
        </p>
        <p className="mt-1.5 text-[11px] text-text-muted tabular-nums">
          {t("bazar.market-turnover")} · Rs {money0.format(index.turnover)}
        </p>
        {marketStatus && !marketStatus.isOpen && marketStatus.asOf && (
          <LastTraded asOf={marketStatus.asOf} />
        )}
        <IndexChart
          state={intraday}
          previousClose={index.value - index.change}
          onRetry={onRetryIntraday}
        />
        {breadth && <BreadthBar breadth={breadth} t={t} />}
      </div>
    </section>
  );
}

/**
 * When the last session ended, in Kathmandu time. Only drawn while the market
 * is closed: on a Saturday or a festival the numbers above are days old, and
 * this is what says so.
 */
function LastTraded({ asOf }: { asOf: string }) {
  const { t, language } = useSettings();
  const instant = new Date(asOf);
  if (Number.isNaN(instant.getTime())) return null;

  const locale = language === "ne" ? "ne-NP-u-nu-latn" : "en-US-u-nu-latn";
  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kathmandu",
  }).format(instant);
  const day =
    nepalToday(instant) === nepalToday()
      ? t("stocks.today")
      : new Intl.DateTimeFormat(locale, {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "Asia/Kathmandu",
        }).format(instant);

  return (
    <p className="mt-1 flex items-center gap-1 text-[10px] text-text-muted tabular-nums">
      <Icon name="clock" className="size-3 shrink-0" />
      {t("stocks.last-traded").replace("{when}", `${day} · ${time}`)}
    </p>
  );
}

/**
 * How the whole board moved, which the index alone can hide: a few heavy banks
 * can lift NEPSE on a day most companies fell. One thin bar and three counts,
 * in the same up/down colours as every change on this screen.
 */
function BreadthBar({ breadth, t }: { breadth: MarketBreadth; t: TFn }) {
  const { advanced, unchanged, declined } = breadth;
  if (advanced + unchanged + declined === 0) return null;
  const count = (key: TranslationKey, n: number) => t(key).replace("{n}", String(n));
  const summary = t("stocks.breadth")
    .replace("{up}", String(advanced))
    .replace("{flat}", String(unchanged))
    .replace("{down}", String(declined));

  return (
    <div className="mt-2.5">
      <div role="img" aria-label={summary} className="flex h-1 gap-px overflow-hidden rounded-full">
        {advanced > 0 && (
          <span
            className="min-w-[2px] basis-0 bg-[color:var(--color-accent-mark)]"
            style={{ flexGrow: advanced }}
          />
        )}
        {unchanged > 0 && (
          <span className="min-w-[2px] basis-0 bg-text-muted/40" style={{ flexGrow: unchanged }} />
        )}
        {declined > 0 && (
          <span className="min-w-[2px] basis-0 bg-holiday" style={{ flexGrow: declined }} />
        )}
      </div>
      <div
        aria-hidden="true"
        className="mt-1 flex items-center justify-between gap-2 text-[10px] font-medium tabular-nums"
      >
        <span className="text-[color:var(--color-accent-mark)]">
          {count("stocks.breadth-up", advanced)}
        </span>
        <span className="text-text-muted">{count("stocks.breadth-flat", unchanged)}</span>
        <span className="text-holiday">{count("stocks.breadth-down", declined)}</span>
      </div>
    </div>
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
