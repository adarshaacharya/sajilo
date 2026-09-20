import { useState } from "react";
import { BackButton } from "../../../shared/components/back-button";
import { Icon } from "../../../shared/components/icon";
import { openExternalLink } from "../../../shared/lib/external-link";
import type { translate } from "../../../shared/lib/i18n";
import type { StockPortfolio } from "../../../types/api/StockPortfolio";
import type { StockPosition } from "../../../types/api/StockPosition";
import type { StockPrice } from "../../../types/api/StockPrice";
import type { StockQuote } from "../../../types/api/StockQuote";
import type { StockTransaction } from "../../../types/api/StockTransaction";
import type { StockTransactionKind } from "../../../types/api/StockTransactionKind";
import { money, money0 } from "../_lib/format";
import { signedMoney, signedPercent } from "../_lib/portfolio";
import { changeText, changeTone, week52Position } from "../_lib/stock-tone";
import { FollowButton } from "./follow-button";
import { RangeBar } from "./range-bar";
import { StatementRow } from "./statement";
import { StockTransactionForm } from "./stock-transaction-form";

type TranslationKey = Parameters<typeof translate>[0];
type TFn = (key: TranslationKey) => string;

function sharesansarUrl(symbol: string) {
  return `https://www.sharesansar.com/company/${symbol.toLowerCase()}`;
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
          onClick={() => openExternalLink(sharesansarUrl(quote.symbol))}
          className="mt-2.5 text-[11px] text-[color:var(--color-accent-mark)] hover:opacity-80"
        >
          {t("stocks.open-sharesansar")}
        </button>
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
