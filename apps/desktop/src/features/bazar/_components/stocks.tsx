import { type ReactNode, useMemo, useState } from "react";
import useSWR from "swr";
import { SearchField } from "../../../shared/components/search-field";
import { type LoadStatus, StateBanner } from "../../../shared/components/state-banner";
import { TabStrip } from "../../../shared/components/tab-strip";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { loadedValue } from "../../../shared/lib/load-state";
import { usePersistedList } from "../../../shared/lib/persisted";
import type { DividendSnapshot } from "../../../types/api/DividendSnapshot";
import type { IndexIntraday } from "../../../types/api/IndexIntraday";
import type { IpoSnapshot } from "../../../types/api/IpoSnapshot";
import type { LoadState } from "../../../types/api/LoadState";
import type { MoverBoard } from "../../../types/api/MoverBoard";
import type { StockMarketSnapshot } from "../../../types/api/StockMarketSnapshot";
import type { StockPortfolio } from "../../../types/api/StockPortfolio";
import type { StockPosition } from "../../../types/api/StockPosition";
import type { StockPrice } from "../../../types/api/StockPrice";
import { money, money0 } from "../_lib/format";
import { findIssue, groupIssues, nepalToday } from "../_lib/ipo";
import { heldPositions, profitPercent, signedMoney, signedPercent } from "../_lib/portfolio";
import {
  changeTone,
  percentText,
  quoteOf,
  searchQuotes,
  shortSectorName,
} from "../_lib/stock-tone";
import { CompanyDetail } from "./company-detail";
import { DividendCard } from "./dividend-card";
import { FollowButton } from "./follow-button";
import { HoldingRow } from "./holding-row";
import { IndexHeadline } from "./index-headline";
import { IpoCard } from "./ipo-card";
import { IpoDetail } from "./ipo-detail";
import { IpoList } from "./ipo-list";
import { MoverRow } from "./mover-row";
import { QuoteRow } from "./quote-row";
import { StatementRow } from "./statement";

const WATCHLIST_KEY = "stockWatchlist";
const WATCHLIST_LIMIT = 12;

/**
 * What the stocks tab is drilled into, if anything. One stack for every
 * detail view keeps "back" meaning the same thing everywhere: an IPO opened
 * from the full list returns to the list, one opened from the market view
 * returns to the market.
 */
type Panel =
  | { kind: "quote"; symbol: string }
  | { kind: "ipos" }
  | { kind: "ipo"; key: string; from: "market" | "ipos" };

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
  ipoState,
  dividendState,
  intradayState,
  onRetry,
  onRetryIpos,
  onRetryDividends,
  onRetryIntraday,
  linkedIpo = null,
  linkedIpoList = false,
  footer = null,
}: {
  state: LoadState<StockMarketSnapshot> | undefined;
  ipoState: LoadState<IpoSnapshot> | undefined;
  dividendState: LoadState<DividendSnapshot> | undefined;
  intradayState: LoadState<IndexIntraday> | undefined;
  onRetry: () => void;
  onRetryIpos: () => void;
  onRetryDividends: () => void;
  onRetryIntraday: () => void;
  /** An issue key to open on arrival, e.g. from the home screen's up-next row. */
  linkedIpo?: string | null;
  linkedIpoList?: boolean;
  /** Drawn under the market view only, never under a drilled-in panel. */
  footer?: ReactNode;
}) {
  const { t } = useSettings();
  const snapshot = loadedValue(state);
  const ipoSnapshot = loadedValue(ipoState);
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<Panel | null>(() => {
    if (linkedIpo) return { kind: "ipo", key: linkedIpo, from: "market" };
    return linkedIpoList ? { kind: "ipos" } : null;
  });
  const [watchlist, setWatchlist] = usePersistedList(WATCHLIST_KEY);
  const [board, setBoard] = useState<MoverBoard>("gainers");
  const prices = useMemo<StockPrice[]>(
    () => snapshot?.quotes.map((quote) => ({ symbol: quote.symbol, price: quote.ltp })) ?? [],
    [snapshot],
  );
  // The key carries the snapshot's timestamp so the portfolio is repriced
  // whenever the market moves — which also means every refresh is a fresh key
  // and a cache miss. Without `keepPreviousData` the holdings card would blank
  // out on each one, and again on every tab switch that lands a new snapshot.
  const { data: portfolio, mutate: mutatePortfolio } = useSWR(
    ["stock-portfolio", snapshot?.freshness.fetchedAt ?? "offline"],
    () => api.stockPortfolio(prices),
    { keepPreviousData: true },
  );
  const positionOf = (symbol: string) =>
    portfolio?.positions.find((position) => position.symbol.toUpperCase() === symbol.toUpperCase());
  const acceptPortfolio = (next: StockPortfolio, symbol?: string) => {
    void mutatePortfolio(next, { revalidate: false });
    if (
      symbol &&
      next.positions.some((position) => position.symbol === symbol && position.quantity > 0)
    ) {
      setWatchlist((current) => {
        if (current.some((item) => item.toUpperCase() === symbol.toUpperCase())) return current;
        return current.length < WATCHLIST_LIMIT ? [...current, symbol.toUpperCase()] : current;
      });
    }
  };

  const today = nepalToday();
  const ipoGroups = useMemo(
    () => (ipoSnapshot ? groupIssues(ipoSnapshot.issues, today) : undefined),
    [ipoSnapshot, today],
  );

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

  // IPO panels do not depend on the ShareSansar feed, so they open even when
  // the market itself failed to load.
  if (panel?.kind === "ipos" && ipoGroups) {
    return (
      <IpoList
        groups={ipoGroups}
        onBack={() => setPanel(null)}
        onOpen={(key) => setPanel({ kind: "ipo", key, from: "ipos" })}
      />
    );
  }

  const openIssue = panel?.kind === "ipo" ? findIssue(ipoGroups, panel.key) : undefined;
  if (panel?.kind === "ipo" && openIssue) {
    return (
      <IpoDetail
        entry={openIssue}
        onBack={() => setPanel(panel.from === "ipos" ? { kind: "ipos" } : null)}
      />
    );
  }

  const ipoCard = (
    <IpoCard
      state={ipoState}
      groups={ipoGroups}
      onOpenIssue={(key) => setPanel({ kind: "ipo", key, from: "market" })}
      onOpenAll={() => setPanel({ kind: "ipos" })}
      onRetry={onRetryIpos}
    />
  );

  if (!snapshot) {
    return (
      <div className="space-y-2.5">
        <StateBanner state={banner(state)} onRetry={onRetry} />
        {heldPositions(portfolio).length > 0 && portfolio && (
          <OfflinePortfolio portfolio={portfolio} />
        )}
        {state && state.status !== "loading" && ipoCard}
      </div>
    );
  }

  const openQuote = panel?.kind === "quote" ? quoteOf(snapshot, panel.symbol) : undefined;
  const openSymbol = (symbol: string) => setPanel({ kind: "quote", symbol });
  const movers = snapshot.movers.filter((row) => row.board === board);
  const held = heldPositions(portfolio);
  const heldSymbols = new Set(held.map((position) => position.symbol.toUpperCase()));
  // A company you own already has a home in the holdings card, so it never
  // appears twice.
  const watchOnly = watchlist.filter((symbol) => !heldSymbols.has(symbol.toUpperCase()));
  const watchRows = watchOnly.map((symbol) => {
    const quote = quoteOf(snapshot, symbol);
    if (!quote) {
      return (
        <div key={symbol} className="row-line flex items-center gap-2 py-1.5">
          <button
            type="button"
            onClick={() => openSymbol(symbol)}
            className="min-w-0 flex-1 px-2 py-1 text-left"
          >
            <span className="block text-[13px] font-semibold">{symbol}</span>
            <span className="block text-[10px] text-text-muted">{t("bazar.not-traded-today")}</span>
          </button>
          <FollowButton followed={followed(symbol)} onToggle={() => toggleFollow(symbol)} />
        </div>
      );
    }
    return (
      <QuoteRow
        key={symbol}
        quote={quote}
        followed
        onOpen={() => openSymbol(symbol)}
        onToggle={() => toggleFollow(symbol)}
      />
    );
  });

  return (
    <StateBanner state={banner(state)} onRetry={onRetry}>
      <div className="space-y-2.5">
        <SearchField
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPanel(null);
          }}
          placeholder={t("stocks.search")}
        />

        {openQuote ? (
          <CompanyDetail
            quote={openQuote}
            followed={followed(openQuote.symbol)}
            onBack={() => setPanel(null)}
            onToggle={() => toggleFollow(openQuote.symbol)}
            position={positionOf(openQuote.symbol)}
            prices={prices}
            priceStale={state?.status === "stale"}
            onPortfolioChange={(next) => acceptPortfolio(next, openQuote.symbol)}
            onDeleteTransaction={async (id) => {
              const next = await api.deleteStockTransaction(id, prices);
              acceptPortfolio(next);
            }}
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
                    onOpen={() => openSymbol(quote.symbol)}
                    onToggle={() => toggleFollow(quote.symbol)}
                    position={positionOf(quote.symbol)}
                  />
                ))
            )}
            {results.length > 25 && (
              <p className="pt-1 text-[10px] text-text-muted">+{results.length - 25}</p>
            )}
          </section>
        ) : (
          <>
            {snapshot.nepse && (
              <IndexHeadline
                index={snapshot.nepse}
                marketStatus={snapshot.marketStatus}
                breadth={snapshot.breadth ?? null}
                intraday={intradayState}
                onRetryIntraday={onRetryIntraday}
                t={t}
              />
            )}

            {ipoCard}

            {/* One starred list, wherever it lives: companies you own carry the
                holdings statement above them, the rest follow underneath. */}
            {held.length > 0 && portfolio ? (
              <HoldingsCard
                portfolio={portfolio}
                held={held}
                onOpen={openSymbol}
                followed={followed}
                onToggle={toggleFollow}
              >
                {watchRows}
              </HoldingsCard>
            ) : (
              <section className="surface-card p-2.5">
                <p className="mb-1 text-[11px] font-semibold text-text-secondary">
                  {t("stocks.watchlist")}
                </p>
                {watchOnly.length === 0 ? (
                  <p className="text-[11px] text-text-secondary">{t("stocks.empty-watchlist")}</p>
                ) : (
                  watchRows
                )}
              </section>
            )}

            <DividendCard
              state={dividendState}
              followed={followed}
              onOpen={openSymbol}
              onRetry={onRetryDividends}
            />

            {snapshot.movers.length > 0 && (
              <section className="surface-card p-2.5 pt-2" aria-label={t("stocks.movers")}>
                <TabStrip
                  label={t("stocks.movers")}
                  value={board}
                  onChange={setBoard}
                  tabs={[
                    { id: "gainers" as const, label: t("stocks.gainers") },
                    { id: "losers" as const, label: t("stocks.losers") },
                    { id: "turnover" as const, label: t("stocks.turnover") },
                    { id: "volume" as const, label: t("stocks.volume") },
                  ]}
                />
                <div className="mt-1" role="tabpanel">
                  {movers.map((mover) => (
                    <MoverRow
                      key={`${mover.board}-${mover.symbol}`}
                      mover={mover}
                      onOpen={() => openSymbol(mover.symbol)}
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

            {footer}
          </>
        )}
      </div>
    </StateBanner>
  );
}

/**
 * Everything owned, as one figure with its profit beside it. The total leads;
 * the cost basis is the small print under it, because the question the card
 * answers first is "what is it worth now".
 */
function HoldingsCard({
  portfolio,
  held,
  onOpen,
  followed,
  onToggle,
  children,
}: {
  portfolio: StockPortfolio;
  held: StockPosition[];
  onOpen: (symbol: string) => void;
  followed: (symbol: string) => boolean;
  onToggle: (symbol: string) => void;
  /** Starred companies that are not held, listed under the ones that are. */
  children?: ReactNode;
}) {
  const { t } = useSettings();
  const profit = portfolio.unrealisedProfitLoss;
  const percent = profitPercent(profit, portfolio.invested);
  return (
    <section className="surface-card p-2.5">
      <p className="text-[11px] font-semibold text-text-secondary">{t("stocks.holdings")}</p>

      <div className="mt-1">
        <StatementRow
          label={t("stocks.portfolio-invested")}
          value={`Rs ${money.format(portfolio.invested)}`}
        />
        <StatementRow
          label={t("stocks.portfolio-market-value")}
          value={portfolio.marketValue == null ? "—" : `Rs ${money.format(portfolio.marketValue)}`}
        />
        <StatementRow
          strong
          divided
          label={
            profit == null
              ? t("stocks.portfolio-unrealised")
              : profit < 0
                ? t("stocks.portfolio-loss")
                : t("stocks.portfolio-profit")
          }
          tone={profit}
          value={
            profit == null
              ? "—"
              : `${signedMoney(profit)}${percent == null ? "" : ` (${signedPercent(percent)})`}`
          }
        />
        {portfolio.realisedProfitLoss !== 0 && (
          <StatementRow
            label={t("stocks.portfolio-realised")}
            tone={portfolio.realisedProfitLoss}
            value={signedMoney(portfolio.realisedProfitLoss)}
          />
        )}
      </div>

      <div className="section-divider mt-2.5 pt-1.5">
        <p className="mb-0.5 text-[10px] font-medium text-text-muted">{t("stocks.watchlist")}</p>
        {held.map((position) => (
          <HoldingRow
            key={position.symbol}
            position={position}
            onOpen={() => onOpen(position.symbol)}
            followed={followed(position.symbol)}
            onToggle={() => onToggle(position.symbol)}
          />
        ))}
        {children}
      </div>
    </section>
  );
}

function OfflinePortfolio({ portfolio }: { portfolio: StockPortfolio }) {
  const { t } = useSettings();
  return (
    <section className="surface-card p-2.5">
      <p className="text-[11px] font-semibold text-text-secondary">{t("stocks.holdings")}</p>
      <p className="mt-0.5 text-[9px] text-text-muted">{t("stocks.portfolio-price-unavailable")}</p>
      <div className="mt-1.5">
        {heldPositions(portfolio).map((position: StockPosition) => (
          <div key={position.symbol} className="row-line flex items-center gap-2 py-1.5">
            <span className="min-w-0 flex-1 text-[13px] font-semibold">{position.symbol}</span>
            <span className="text-right text-[10px] text-text-muted tabular-nums">
              {money0.format(position.quantity)} {t("stocks.portfolio-kitta")} ·{" "}
              {t("stocks.portfolio-average-short")} Rs {money.format(position.averageCost)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
