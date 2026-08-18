import { useEffect, useMemo, useState } from "react";
import { BazarSearch } from "../../components/bazar/BazarSearch";
import { ChangeBadge } from "../../components/bazar/ChangeBadge";
import { Icon } from "../../components/Icon";
import { Segmented } from "../../components/Segmented";
import { type LoadStatus, StateBanner } from "../../components/StateBanner";
import { money, money0 } from "../../lib/bazar";
import type { translate } from "../../lib/i18n";
import { loadedValue } from "../../lib/loadState";
import { useSettings } from "../../lib/settings";
import type { LoadState } from "../../types/api/LoadState";
import type {
  MarketIndex,
  MarketMover,
  MoverBoard,
  StockMarketSnapshot,
  StockQuote,
} from "../../types/api/StockMarketSnapshot";

type TranslationKey = Parameters<typeof translate>[0];
type TFn = (key: TranslationKey) => string;

const WATCHLIST_KEY = "stockWatchlist";
const WATCHLIST_LIMIT = 12;

function banner(state: LoadState<StockMarketSnapshot> | undefined): LoadStatus {
  if (!state) return { status: "loading" };
  switch (state.status) {
    case "stale":
      return { status: "stale" };
    case "failed":
      return { status: "failed", message: state.value };
    default:
      return { status: state.status };
  }
}

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveWatchlist(symbols: string[]) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(symbols));
}

function quoteOf(snapshot: StockMarketSnapshot, symbol: string): StockQuote | undefined {
  return snapshot.quotes.find((q) => q.symbol.toLowerCase() === symbol.toLowerCase());
}

function searchQuotes(snapshot: StockMarketSnapshot, query: string): StockQuote[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  return snapshot.quotes
    .filter(
      (q) =>
        q.symbol.toLowerCase().includes(trimmed) ||
        (q.companyName?.toLowerCase().includes(trimmed) ?? false),
    )
    .sort((a, b) => {
      const aSym = a.symbol.toLowerCase().includes(trimmed);
      const bSym = b.symbol.toLowerCase().includes(trimmed);
      if (aSym !== bSym) return aSym ? -1 : 1;
      return a.symbol.localeCompare(b.symbol);
    });
}

function changeTone(change: number) {
  if (Math.abs(change) < 0.005) return "text-text-muted";
  return change > 0 ? "text-[color:var(--color-accent-mark)]" : "text-holiday";
}

function percentText(change: number, percent: number) {
  const sign = change > 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}

function changeText(change: number, percent: number) {
  const sign = change > 0 ? "+" : "";
  return `${sign}${money.format(change)} (${sign}${percent.toFixed(2)}%)`;
}

function shortSectorName(name: string) {
  return name
    .replace(/ SubIndex$/i, "")
    .replace(/ Sub Index$/i, "")
    .replace(/ Index$/i, "");
}

function week52Position(quote: StockQuote): number | null {
  if (quote.week52High == null || quote.week52Low == null || quote.week52High <= quote.week52Low) {
    return null;
  }
  return Math.min(1, Math.max(0, (quote.ltp - quote.week52Low) / (quote.week52High - quote.week52Low)));
}

async function openSharesansar(symbol: string) {
  const url = `https://www.sharesansar.com/company/${symbol.toLowerCase()}`;
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function FollowButton({ followed, onToggle }: { followed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`shrink-0 p-1 ${followed ? "text-[color:var(--color-accent-mark)]" : "text-text-muted"}`}
      aria-label={followed ? "Unfollow" : "Follow"}
    >
      {followed ? <Icon name="starFill" className="size-3.5" /> : <Icon name="star" className="size-3.5" />}
    </button>
  );
}

function RangeBar({
  title,
  low,
  high,
  position,
}: {
  title: string;
  low: number;
  high: number;
  position: number | null;
}) {
  return (
    <div>
      <p className="text-[10px] text-text-muted">{title}</p>
      <div className="relative mt-1 h-1.5 rounded-full bg-surface">
        {position != null && (
          <span
            className="absolute top-0 h-1.5 w-0.5 rounded-full bg-[color:var(--color-accent-mark)]"
            style={{ left: `calc(${position * 100}% - 1px)` }}
          />
        )}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-text-muted tabular-nums">
        <span>{money.format(low)}</span>
        <span>{money.format(high)}</span>
      </div>
    </div>
  );
}

function QuoteRow({
  quote,
  followed,
  onOpen,
  onToggle,
}: {
  quote: StockQuote;
  followed: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="row-line flex items-center gap-2 py-1.5">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{quote.symbol}</span>
          {quote.companyName && (
            <span className="block truncate text-[10px] text-text-muted">{quote.companyName}</span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[13px] font-medium tabular-nums">Rs {money.format(quote.ltp)}</span>
          <span className={`block text-[10px] font-medium tabular-nums ${changeTone(quote.change)}`}>
            {percentText(quote.change, quote.changePercent)}
          </span>
        </span>
      </button>
      <FollowButton followed={followed} onToggle={onToggle} />
    </div>
  );
}

export function Stocks({
  state,
  onRetry,
}: {
  state: LoadState<StockMarketSnapshot> | undefined;
  onRetry: () => void;
}) {
  const { t } = useSettings();
  const snapshot = loadedValue(state);
  const [query, setQuery] = useState("");
  const [opened, setOpened] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>(loadWatchlist);
  const [board, setBoard] = useState<MoverBoard>("gainers");

  useEffect(() => saveWatchlist(watchlist), [watchlist]);

  const toggleFollow = (symbol: string) => {
    const upper = symbol.toUpperCase();
    setWatchlist((current) => {
      if (current.some((item) => item.toUpperCase() === upper)) {
        return current.filter((item) => item.toUpperCase() !== upper);
      }
      if (current.length >= WATCHLIST_LIMIT) return current;
      return [...current, upper];
    });
  };

  const followed = (symbol: string) =>
    watchlist.some((item) => item.toUpperCase() === symbol.toUpperCase());

  const results = useMemo(
    () => (snapshot && query.trim() ? searchQuotes(snapshot, query) : []),
    [snapshot, query],
  );

  const openQuote = opened && snapshot ? quoteOf(snapshot, opened) : undefined;
  const movers = snapshot?.movers.filter((row) => row.board === board) ?? [];

  return (
    <StateBanner state={banner(state)} onRetry={onRetry}>
      {snapshot && (
        <div className="space-y-2.5">
          <BazarSearch
            value={query}
            onChange={(value) => {
              setQuery(value);
              setOpened(null);
            }}
            placeholder={t("stocks.search")}
          />

          {openQuote ? (
            <CompanyDetail
              quote={openQuote}
              followed={followed(openQuote.symbol)}
              onBack={() => setOpened(null)}
              onToggle={() => toggleFollow(openQuote.symbol)}
              t={t}
            />
          ) : query.trim() ? (
            <section className="surface-card p-2.5">
              {results.length === 0 ? (
                <p className="text-text-secondary">{t("stocks.no-match")}</p>
              ) : (
                results.slice(0, 25).map((quote) => (
                  <QuoteRow
                    key={quote.symbol}
                    quote={quote}
                    followed={followed(quote.symbol)}
                    onOpen={() => setOpened(quote.symbol)}
                    onToggle={() => toggleFollow(quote.symbol)}
                  />
                ))
              )}
              {results.length > 25 && (
                <p className="pt-1 text-[10px] text-text-muted">+{results.length - 25}</p>
              )}
            </section>
          ) : (
            <>
              {snapshot.nepse && <IndexHeadline index={snapshot.nepse} t={t} />}

              <section className="surface-card p-2.5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  {t("stocks.watchlist")}
                </p>
                {watchlist.length === 0 ? (
                  <p className="text-[11px] text-text-secondary">{t("stocks.empty-watchlist")}</p>
                ) : (
                  watchlist.map((symbol) => {
                    const quote = quoteOf(snapshot, symbol);
                    if (!quote) {
                      return (
                        <div
                          key={symbol}
                          className="row-line flex items-center gap-2 py-1.5"
                        >
                          <span className="font-semibold">{symbol}</span>
                          <span className="flex-1 text-[10px] text-text-muted">
                            {t("bazar.not-traded-today")}
                          </span>
                          <FollowButton followed onToggle={() => toggleFollow(symbol)} />
                        </div>
                      );
                    }
                    return (
                      <QuoteRow
                        key={symbol}
                        quote={quote}
                        followed
                        onOpen={() => setOpened(symbol)}
                        onToggle={() => toggleFollow(symbol)}
                      />
                    );
                  })
                )}
              </section>

              {snapshot.movers.length > 0 && (
                <section className="surface-card p-2.5">
                  <Segmented
                    label={t("stocks.movers")}
                    value={board}
                    onChange={setBoard}
                    options={[
                      { id: "gainers" as const, label: t("stocks.gainers") },
                      { id: "losers" as const, label: t("stocks.losers") },
                      { id: "turnover" as const, label: t("stocks.turnover") },
                      { id: "volume" as const, label: t("stocks.volume") },
                    ]}
                  />
                  <div className="mt-2">
                    {movers.map((mover) => (
                      <MoverRow key={`${mover.board}-${mover.symbol}`} mover={mover} onOpen={() => setOpened(mover.symbol)} />
                    ))}
                    {movers.length === 0 && (
                      <p className="text-[11px] text-text-muted">{t("stocks.no-match")}</p>
                    )}
                  </div>
                </section>
              )}

              {snapshot.subIndices.length > 0 && (
                <section className="surface-card p-2.5">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    {t("stocks.sectors")}
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {snapshot.subIndices.map((index) => (
                      <div
                        key={index.name}
                        className="flex items-center gap-1 rounded-md bg-surface px-1.5 py-1"
                      >
                        <span className="min-w-0 flex-1 truncate text-[10px]">
                          {shortSectorName(index.name)}
                        </span>
                        <span
                          className={`shrink-0 text-[10px] font-medium tabular-nums ${changeTone(index.change)}`}
                        >
                          {percentText(index.change, index.changePercent)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </StateBanner>
  );
}

function IndexHeadline({ index, t }: { index: MarketIndex; t: TFn }) {
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

function MoverRow({ mover, onOpen }: { mover: MarketMover; onOpen: () => void }) {
  const isPercent = mover.board === "gainers" || mover.board === "losers";
  const up = mover.metric > 0;
  const flat = Math.abs(mover.metric) < 0.005;
  const tone = flat
    ? "text-text-muted"
    : up
      ? "text-[color:var(--color-accent-mark)]"
      : "text-holiday";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="row-line flex w-full items-center gap-2 py-1.5 text-left"
    >
      <span className="w-[68px] shrink-0 text-[11px] font-semibold">{mover.symbol}</span>
      <span className="text-[11px] text-text-muted tabular-nums">Rs {money.format(mover.ltp)}</span>
      <span className={`ml-auto text-[11px] font-medium tabular-nums ${isPercent ? tone : "text-text-secondary"}`}>
        {isPercent
          ? `${up && !flat ? "+" : ""}${mover.metric.toFixed(2)}%`
          : mover.board === "turnover"
            ? `Rs ${money0.format(mover.metric)}`
            : money0.format(mover.metric)}
      </span>
    </button>
  );
}

function CompanyDetail({
  quote,
  followed,
  onBack,
  onToggle,
  t,
}: {
  quote: StockQuote;
  followed: boolean;
  onBack: () => void;
  onToggle: () => void;
  t: TFn;
}) {
  const dayPos =
    quote.low != null && quote.high != null && quote.high > quote.low
      ? (quote.ltp - quote.low) / (quote.high - quote.low)
      : null;

  const stats: { label: string; value: string }[] = [
    { label: t("stocks.open"), value: quote.open != null ? money.format(quote.open) : "—" },
    { label: t("stocks.high"), value: quote.high != null ? money.format(quote.high) : "—" },
    { label: t("stocks.low"), value: quote.low != null ? money.format(quote.low) : "—" },
    { label: t("stocks.prev-close"), value: money.format(quote.previousClose) },
    { label: t("stocks.vwap"), value: quote.vwap != null ? money.format(quote.vwap) : "—" },
    {
      label: t("stocks.traded"),
      value: quote.volume != null ? money0.format(quote.volume) : "—",
    },
    {
      label: t("stocks.trades"),
      value: quote.transactions != null ? money0.format(quote.transactions) : "—",
    },
    {
      label: t("stocks.avg-120"),
      value: quote.average120Day != null ? money.format(quote.average120Day) : "—",
    },
    {
      label: t("stocks.avg-180"),
      value: quote.average180Day != null ? money.format(quote.average180Day) : "—",
    },
  ];

  return (
    <section className="surface-card p-2.5">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("action.back")}
          className="icon-btn shrink-0"
        >
          <Icon name="chevronLeft" className="size-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-tight">{quote.symbol}</p>
          {quote.companyName && (
            <p className="text-[11px] text-text-muted">{quote.companyName}</p>
          )}
        </div>
        <FollowButton followed={followed} onToggle={onToggle} />
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-[22px] font-semibold tabular-nums">Rs {money.format(quote.ltp)}</p>
        <p className={`text-[11px] font-medium tabular-nums ${changeTone(quote.change)}`}>
          {changeText(quote.change, quote.changePercent)}
        </p>
      </div>

      <div className="mt-2 space-y-2">
        {quote.week52Low != null && quote.week52High != null && (
          <RangeBar
            title={t("stocks.week52")}
            low={quote.week52Low}
            high={quote.week52High}
            position={week52Position(quote)}
          />
        )}
        {quote.low != null && quote.high != null && quote.high > quote.low && (
          <RangeBar
            title={t("stocks.day-range")}
            low={quote.low}
            high={quote.high}
            position={dayPos}
          />
        )}
      </div>

      <div className="section-divider mt-3 grid grid-cols-3 gap-2 pt-2">
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className="truncate text-[10px] text-text-muted">{stat.label}</p>
            <p className="text-[11px] font-medium tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => openSharesansar(quote.symbol)}
        className="mt-2 text-[11px] text-[color:var(--color-accent-mark)] hover:opacity-80"
      >
        {t("stocks.open-sharesansar")}
      </button>
    </section>
  );
}
