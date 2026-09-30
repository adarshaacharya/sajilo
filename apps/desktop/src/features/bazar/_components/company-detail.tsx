import { useState } from "react";
import useSWR from "swr";
import { BackButton } from "../../../shared/components/back-button";
import { Icon } from "../../../shared/components/icon";
import { SkeletonBlock } from "../../../shared/components/skeleton";
import { openExternalLink } from "../../../shared/lib/external-link";
import type { translate } from "../../../shared/lib/i18n";
import { api } from "../../../shared/lib/ipc";
import { catchAsFailed, loadedValue } from "../../../shared/lib/load-state";
import type { StockPortfolio } from "../../../types/api/StockPortfolio";
import type { StockPosition } from "../../../types/api/StockPosition";
import type { StockPrice } from "../../../types/api/StockPrice";
import type { StockQuote } from "../../../types/api/StockQuote";
import type { StockTransaction } from "../../../types/api/StockTransaction";
import type { StockTransactionKind } from "../../../types/api/StockTransactionKind";
import { money, money0, money2 } from "../_lib/format";
import { signedMoney, signedPercent } from "../_lib/portfolio";
import { changeTone, week52Position } from "../_lib/stock-tone";
import { FollowButton } from "./follow-button";
import { RangeBar } from "./range-bar";
import { StatementRow } from "./statement";
import { StockChart } from "./stock-chart";
import { StockTransactionForm } from "./stock-transaction-form";

type TranslationKey = Parameters<typeof translate>[0];
type TFn = (key: TranslationKey) => string;

function sharesansarUrl(symbol: string) {
  return `https://www.sharesansar.com/company/${symbol.toLowerCase()}`;
}

function merolaganiUrl(symbol: string) {
  return `https://merolagani.com/CompanyDetail.aspx?symbol=${symbol}`;
}

type Row = { label: string; value: string; note?: string };

/** A titled block of the share page: Today's trading, Performance, Fundamentals. */
function StockSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="stock-section">
      <h3 className="stock-label">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/** Label on the left, figure on the right, one per line, as Merolagani lists them. */
function StockRows({ rows }: { rows: Row[] }) {
  return (
    <dl className="stock-rows">
      {rows.map((row) => (
        <div key={row.label} className="stock-row">
          <dt className="text-text-muted">{row.label}</dt>
          <dd className="text-right font-medium tabular-nums">
            {row.value}
            {row.note && (
              <span className="ml-1 text-[10px] font-normal text-text-muted">{row.note}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** EPS, P/E, book value, dividends and the rest, from Merolagani. */
function Fundamentals({ symbol, t }: { symbol: string; t: TFn }) {
  const { data } = useSWR(["stock-fundamentals", symbol], () =>
    catchAsFailed(api.getStockFundamentals(symbol)),
  );
  const f = loadedValue(data);
  if (!data) {
    return (
      <StockSection title={t("stocks.section-fundamentals")}>
        <SkeletonBlock className="h-[120px] w-full" />
      </StockSection>
    );
  }
  if (!f) {
    return (
      <StockSection title={t("stocks.section-fundamentals")}>
        <p className="text-[10.5px] text-text-muted">{t("stocks.fundamentals-unavailable")}</p>
      </StockSection>
    );
  }
  const plain = (value: number | null | undefined) => (value != null ? money2.format(value) : "—");
  const percent = (value: number | null | undefined) =>
    value != null ? `${money2.format(value)}%` : "—";
  const fundamentals: Row[] = [
    {
      label: t("stocks.eps"),
      value: f.eps ? `Rs ${money2.format(f.eps.value)}` : "—",
      note: f.eps?.period,
    },
    { label: t("stocks.pe"), value: plain(f.peRatio) },
    {
      label: t("stocks.book-value"),
      value: f.bookValue != null ? `Rs ${money2.format(f.bookValue)}` : "—",
    },
    { label: t("stocks.pbv"), value: plain(f.pbv) },
    {
      label: t("stocks.market-cap"),
      value: f.marketCap != null ? `Rs ${money0.format(f.marketCap)}` : "—",
    },
    {
      label: t("stocks.shares-outstanding"),
      value: f.sharesOutstanding != null ? money0.format(f.sharesOutstanding) : "—",
    },
    { label: t("stocks.one-year-yield"), value: percent(f.oneYearYield) },
    {
      label: t("stocks.avg-volume-30"),
      value: f.averageVolume30Day != null ? money0.format(f.averageVolume30Day) : "—",
    },
  ];
  const dividends: Row[] = [
    {
      label: t("stocks.cash-dividend"),
      value: f.cashDividend ? `${money2.format(f.cashDividend.value)}%` : "—",
      note: f.cashDividend?.period,
    },
    {
      label: t("stocks.bonus-share"),
      value: f.bonusShare ? `${money2.format(f.bonusShare.value)}%` : "—",
      note: f.bonusShare?.period,
    },
    ...(f.rightShare ? [{ label: t("stocks.right-share"), value: f.rightShare }] : []),
  ];
  return (
    <>
      <StockSection title={t("stocks.section-fundamentals")}>
        {f.sector && (
          <p className="text-[10.5px] text-text-muted">
            {t("stocks.sector")}: {f.sector}
          </p>
        )}
        <StockRows rows={fundamentals} />
      </StockSection>
      <StockSection title={t("stocks.section-dividends")}>
        <StockRows rows={dividends} />
      </StockSection>
    </>
  );
}

/**
 * One company, as three stacked cards: what the market says, what you hold,
 * and what you recorded. They are separate cards because they answer separate
 * questions — a holding pinned to the bottom of a wall of market statistics
 * read like a footnote to the price.
 */
export function CompanyDetail({
  quote,
  followed,
  onBack,
  onToggle,
  position,
  prices,
  priceStale,
  onPortfolioChange,
  onDeleteTransaction,
  asOf,
  t,
}: {
  quote: StockQuote;
  followed: boolean;
  onBack: () => void;
  onToggle: () => void;
  position?: StockPosition;
  prices: StockPrice[];
  priceStale: boolean;
  onPortfolioChange: (portfolio: StockPortfolio) => void;
  onDeleteTransaction: (id: string) => Promise<void>;
  /** When the price was last traded or published, for "As on". */
  asOf?: string;
  t: TFn;
}) {
  const [editing, setEditing] = useState<{
    kind: StockTransactionKind;
    transaction?: StockTransaction;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const held = position != null && position.quantity > 0;
  const dayPos =
    quote.low != null && quote.high != null && quote.high > quote.low
      ? (quote.ltp - quote.low) / (quote.high - quote.low)
      : null;

  const rs = (value: number | null | undefined) =>
    value != null ? `Rs ${money2.format(value)}` : "—";
  const count = (value: number | null | undefined) => (value != null ? money0.format(value) : "—");
  // Today's session, labelled as NEPSE sites label it.
  const trading: Row[] = [
    { label: t("stocks.open"), value: rs(quote.open) },
    { label: t("stocks.high"), value: rs(quote.high) },
    { label: t("stocks.low"), value: rs(quote.low) },
    { label: t("stocks.prev-close"), value: rs(quote.previousClose) },
    { label: t("stocks.vwap"), value: rs(quote.vwap) },
    { label: t("stocks.volume"), value: count(quote.volume) },
    {
      label: t("stocks.turnover"),
      value: quote.turnover > 0 ? `Rs ${money0.format(quote.turnover)}` : "—",
    },
    { label: t("stocks.trades"), value: count(quote.transactions) },
  ];
  const averages: Row[] = [
    { label: t("stocks.avg-120"), value: rs(quote.average120Day) },
    { label: t("stocks.avg-180"), value: rs(quote.average180Day) },
  ];

  // Recording a trade is its own screen, not a form hiding under a wall of
  // market statistics. Only the symbol and its price stay on screen —
  // everything else is noise while you are typing a quantity.
  if (editing) {
    return (
      <section className="surface-card p-2.5">
        <div className="flex items-start gap-2">
          <BackButton onClick={() => setEditing(null)} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-tight">
              {editing.transaction
                ? t("stocks.portfolio-edit")
                : editing.kind === "purchase"
                  ? t("stocks.portfolio-add-purchase")
                  : t("stocks.portfolio-record-sale")}
            </p>
            <p className="text-[11px] text-text-muted tabular-nums">
              {quote.symbol} · Rs {money.format(quote.ltp)}
            </p>
          </div>
        </div>
        <StockTransactionForm
          symbol={quote.symbol}
          initial={editing.transaction}
          kind={editing.kind}
          marketPrice={quote.ltp}
          prices={prices}
          onSaved={(portfolio) => {
            onPortfolioChange(portfolio);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      </section>
    );
  }

  return (
    <>
      <section className="surface-card p-2.5">
        <div className="flex items-start gap-2">
          <BackButton onClick={onBack} />
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold leading-tight">{quote.symbol}</p>
            {quote.companyName && (
              <p className="text-[11px] text-text-muted">{quote.companyName}</p>
            )}
          </div>
          <FollowButton followed={followed} onToggle={onToggle} />
        </div>

        {/* Labelled the way ShareSansar ("Ltp", "As on") and Merolagani
            ("Market Price", "% Change") label it, so it reads as familiar. */}
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <p className="stock-label">{t("stocks.market-price")}</p>
          {asOf && (
            <p className="text-[10px] text-text-muted tabular-nums">
              {t("stocks.as-on")} {asOf}
            </p>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <p className="text-[22px] font-semibold tabular-nums">Rs {money2.format(quote.ltp)}</p>
          <p className={`text-[11px] font-medium tabular-nums ${changeTone(quote.change)}`}>
            {quote.change > 0 ? "▲" : quote.change < 0 ? "▼" : ""}{" "}
            {money2.format(Math.abs(quote.change))} ({Math.abs(quote.changePercent).toFixed(2)}%)
          </p>
          <p className="text-[10px] text-text-muted">{t("stocks.today")}</p>
        </div>

        <StockChart symbol={quote.symbol} />
      </section>

      <section className="surface-card p-2.5">
        <StockSection title={t("stocks.section-trading")}>
          {quote.low != null && quote.high != null && quote.high > quote.low && (
            <RangeBar
              title={t("stocks.day-range")}
              low={quote.low}
              high={quote.high}
              position={dayPos}
            />
          )}
          <StockRows rows={trading} />
        </StockSection>

        <StockSection title={t("stocks.section-performance")}>
          {quote.week52Low != null && quote.week52High != null && (
            <RangeBar
              title={t("stocks.week52")}
              low={quote.week52Low}
              high={quote.week52High}
              position={week52Position(quote)}
            />
          )}
          <StockRows rows={averages} />
        </StockSection>

        <Fundamentals symbol={quote.symbol} t={t} />

        <div className="section-divider mt-3 flex gap-4 pt-2">
          <button
            type="button"
            onClick={() => openExternalLink(sharesansarUrl(quote.symbol))}
            className="text-[11px] text-[color:var(--color-accent-mark)] hover:opacity-80"
          >
            {t("stocks.open-sharesansar")}
          </button>
          <button
            type="button"
            onClick={() => openExternalLink(merolaganiUrl(quote.symbol))}
            className="text-[11px] text-[color:var(--color-accent-mark)] hover:opacity-80"
          >
            {t("stocks.open-merolagani")}
          </button>
        </div>
      </section>

      <section className="surface-card p-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-semibold text-text-secondary">
            {t("stocks.portfolio-position")}
          </p>
          {held && position && (
            <p className="min-w-0 truncate text-[10px] text-text-muted tabular-nums">
              {money0.format(position.quantity)} {t("stocks.portfolio-kitta")} ·{" "}
              {t("stocks.portfolio-average-short")} Rs {money.format(position.averageCost)}
            </p>
          )}
        </div>

        {held && position ? (
          <div className="mt-1.5">
            <StatementRow
              label={t("stocks.portfolio-invested")}
              value={`Rs ${money.format(position.invested)}`}
            />
            <StatementRow
              label={
                priceStale
                  ? `${t("stocks.portfolio-market-value")} · ${t("stocks.portfolio-stale-price")}`
                  : t("stocks.portfolio-market-value")
              }
              value={
                position.marketValue == null ? "—" : `Rs ${money.format(position.marketValue)}`
              }
            />
            <StatementRow
              strong
              divided
              label={profitLabel(position.unrealisedProfitLoss, t)}
              tone={position.unrealisedProfitLoss}
              value={
                position.unrealisedProfitLoss == null
                  ? "—"
                  : `${signedMoney(position.unrealisedProfitLoss)}${
                      position.unrealisedPercent == null
                        ? ""
                        : ` (${signedPercent(position.unrealisedPercent)})`
                    }`
              }
            />
            {position.realisedProfitLoss !== 0 && (
              <StatementRow
                label={t("stocks.portfolio-realised")}
                tone={position.realisedProfitLoss}
                value={signedMoney(position.realisedProfitLoss)}
              />
            )}
          </div>
        ) : (
          <p className="mt-1 text-[10px] leading-snug text-text-muted">
            {position ? t("stocks.portfolio-sold-out") : t("stocks.portfolio-empty-position")}
          </p>
        )}

        {/* Tools, not the headline: sized to their labels and set to the right
            so the figures above stay the loudest thing on the card. */}
        <div className="mt-2.5 flex justify-end gap-2">
          <button
            type="button"
            disabled={!held}
            onClick={() => setEditing({ kind: "sale" })}
            className="settings-btn"
          >
            <Icon name="minus" className="size-2.5" />
            {t("stocks.portfolio-record-sale")}
          </button>
          <button
            type="button"
            onClick={() => setEditing({ kind: "purchase" })}
            className="settings-btn settings-btn--accent"
          >
            <Icon name="plus" className="size-2.5" />
            {t("stocks.portfolio-add-purchase")}
          </button>
        </div>
      </section>

      {position && position.transactions.length > 0 && (
        <section className="surface-card p-2.5">
          <p className="text-[11px] font-semibold text-text-secondary">
            {t("stocks.portfolio-transactions")}
          </p>
          <div className="mt-1">
            {[...position.transactions].reverse().map((transaction) => (
              <div key={transaction.id} className="row-line flex items-center gap-2 py-2">
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-md ${
                    transaction.kind === "purchase"
                      ? "bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] text-positive"
                      : "bg-[color-mix(in_srgb,var(--color-holiday)_12%,transparent)] text-holiday"
                  }`}
                >
                  <Icon
                    name={transaction.kind === "purchase" ? "plus" : "minus"}
                    className="size-2.5"
                  />
                </span>
                <button
                  type="button"
                  onClick={() => setEditing({ kind: transaction.kind, transaction })}
                  className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium tabular-nums">
                      {money0.format(transaction.quantity)} {t("stocks.portfolio-kitta")} @ Rs{" "}
                      {money.format(transaction.price)}
                    </span>
                    {transaction.source && (
                      <span className="block truncate text-[9px] text-text-muted">
                        {t(`stocks.portfolio-source-${transaction.source}` as TranslationKey)}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[9px] text-text-muted tabular-nums">
                    {formatTradeDate(transaction.tradeDate)}
                  </span>
                </button>
                {confirmDelete === transaction.id ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(null)}
                      className="btn-ghost px-1.5 text-[9px]"
                    >
                      {t("action.cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError("");
                        onDeleteTransaction(transaction.id)
                          .then(() => setConfirmDelete(null))
                          .catch((error: unknown) => setDeleteError(String(error)));
                      }}
                      className="btn-ghost px-1.5 text-[9px] text-holiday"
                    >
                      {t("action.delete")}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(transaction.id)}
                    aria-label={t("action.delete")}
                    className="icon-btn size-5 shrink-0"
                  >
                    <Icon name="trash" className="size-2.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {deleteError && (
            <p role="alert" className="mt-1 text-[10px] leading-snug text-holiday">
              {deleteError}
            </p>
          )}
          {position.transactions.some(
            (transaction) => transaction.feesEstimated || transaction.taxEstimated,
          ) && (
            <p className="mt-1.5 text-[9px] leading-snug text-text-muted">
              {t("stocks.portfolio-pl-note")}
            </p>
          )}
        </section>
      )}
    </>
  );
}

/** "Profit" or "Loss" — the word for what the number is, not an accounting term. */
function profitLabel(profit: number | null, t: TFn): string {
  if (profit == null) return t("stocks.portfolio-unrealised");
  return profit < 0 ? t("stocks.portfolio-loss") : t("stocks.portfolio-profit");
}

function formatTradeDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}
