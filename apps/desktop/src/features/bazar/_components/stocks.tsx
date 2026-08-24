import { useMemo, useState } from "react";
import { Segmented } from "../../../shared/components/segmented";
import { type LoadStatus, StateBanner } from "../../../shared/components/state-banner";
import { useSettings } from "../../../shared/context/settings-context";
import { loadedValue } from "../../../shared/lib/load-state";
import { usePersistedList } from "../../../shared/lib/persisted";
import type { LoadState } from "../../../types/api/LoadState";
import type { MoverBoard } from "../../../types/api/MoverBoard";
import type { StockMarketSnapshot } from "../../../types/api/StockMarketSnapshot";
import {
  changeTone,
  percentText,
  quoteOf,
  searchQuotes,
  shortSectorName,
} from "../_lib/stock-tone";
import { BazarSearch } from "./bazar-search";
import { CompanyDetail } from "./company-detail";
import { FollowButton } from "./follow-button";
import { IndexHeadline } from "./index-headline";
import { MoverRow } from "./mover-row";
import { QuoteRow } from "./quote-row";

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
  const [watchlist, setWatchlist] = usePersistedList(WATCHLIST_KEY);
  const [board, setBoard] = useState<MoverBoard>("gainers");

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
                results
                  .slice(0, 25)
                  .map((quote) => (
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
                <p className="mb-1 text-[11px] font-semibold text-text-secondary">
                  {t("stocks.watchlist")}
                </p>
                {watchlist.length === 0 ? (
                  <p className="text-[11px] text-text-secondary">{t("stocks.empty-watchlist")}</p>
                ) : (
                  watchlist.map((symbol) => {
                    const quote = quoteOf(snapshot, symbol);
                    if (!quote) {
                      return (
                        <div key={symbol} className="row-line flex items-center gap-2 py-1.5">
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
                      <MoverRow
                        key={`${mover.board}-${mover.symbol}`}
                        mover={mover}
                        onOpen={() => setOpened(mover.symbol)}
                      />
                    ))}
                    {movers.length === 0 && (
                      <p className="text-[11px] text-text-muted">{t("stocks.no-match")}</p>
                    )}
                  </div>
                </section>
              )}

              {snapshot.subIndices.length > 0 && (
                <section className="surface-card p-2.5">
                  <p className="mb-1.5 text-[11px] font-semibold text-text-secondary">
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
