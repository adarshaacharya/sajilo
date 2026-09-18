import { type ReactNode, useMemo, useState } from "react";
import { type LoadStatus, StateBanner } from "../../../shared/components/state-banner";
import { TabStrip } from "../../../shared/components/tab-strip";
import { useSettings } from "../../../shared/context/settings-context";
import { loadedValue } from "../../../shared/lib/load-state";
import type { FundKind } from "../../../types/api/FundKind";
import type { LoadState } from "../../../types/api/LoadState";
import type { MutualFund } from "../../../types/api/MutualFund";
import type { MutualFundSnapshot } from "../../../types/api/MutualFundSnapshot";
import { money, sourceStamp } from "../_lib/format";
import {
  byDiscount,
  byMaturity,
  byWeeklyMove,
  navMove,
  searchFunds,
  unitValue,
  useFundHoldings,
} from "../_lib/funds";
import { nepalToday } from "../_lib/ipo";
import { BazarSearch } from "./bazar-search";
import { FundDetail } from "./fund-detail";
import { FundRow } from "./fund-row";
import { SourceLink, SourceNote } from "./source-note";

const SHAREHUB_LINK = "https://sharehubnepal.com/company/mutual-fund-nav/open-end";
const SOURCE_LINKS: Record<string, string> = {
  ShareHub: SHAREHUB_LINK,
  ShareSansar: "https://www.sharesansar.com/mutual-fund-navs",
};

const KINDS = [
  { id: "openEnd", label: "funds.open-end" },
  { id: "closedEnd", label: "funds.closed-end" },
  { id: "matured", label: "funds.matured" },
] as const;

const ORDER: Record<FundKind, (a: MutualFund, b: MutualFund) => number> = {
  openEnd: byWeeklyMove,
  closedEnd: byDiscount,
  matured: byMaturity,
};

/** What the right-hand figures in each tab are, said once above the rows. */
const COLUMN = {
  openEnd: "funds.col-week",
  closedEnd: "funds.col-market",
  matured: "funds.col-refund",
} as const;

function banner(state: LoadState<MutualFundSnapshot> | undefined): LoadStatus {
  if (!state) return { status: "loading" };
  switch (state.status) {
    case "stale":
      return { status: "stale", since: sourceStamp(state.value.freshness) };
    case "failed":
      return { status: "failed", message: state.value };
    default:
      return { status: state.status };
  }
}

/**
 * The mutual funds view: the funds the user keeps, with what their units are
 * worth, above every scheme's latest NAV.
 *
 * Open-end schemes come first because they are what an SIP buys; closed-end
 * ones sit behind the second tab, ranked by how far below NAV NEPSE is
 * selling them.
 */
export function MutualFunds({
  state,
  onRetry,
}: {
  state: LoadState<MutualFundSnapshot> | undefined;
  onRetry: () => void;
}) {
  const { t } = useSettings();
  const snapshot = loadedValue(state);
  const { holdings, toggle, setUnits } = useFundHoldings();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<FundKind>("openEnd");
  const [open, setOpen] = useState<string | null>(null);
  const today = nepalToday();

  const funds = snapshot?.funds ?? [];
  const bySymbol = useMemo(() => new Map(funds.map((fund) => [fund.symbol, fund])), [funds]);
  // A tab is drawn only when the source sent funds of that kind; a fallback
  // that could only reach open-end NAVs shows them without empty tabs beside.
  const kinds = KINDS.filter((item) => funds.some((fund) => fund.kind === item.id));
  const shownKind = kinds.some((item) => item.id === kind) ? kind : "openEnd";
  const listed = useMemo(() => {
    const ofKind = funds.filter((fund) => fund.kind === shownKind);
    return searchFunds(ofKind, query).sort(ORDER[shownKind]);
  }, [funds, shownKind, query]);
  const matches = useMemo(() => (query.trim() ? searchFunds(funds, query) : []), [funds, query]);

  const openFund = open ? bySymbol.get(open) : undefined;
  if (openFund) {
    return (
      <FundDetail
        fund={openFund}
        today={today}
        followed={openFund.symbol in holdings}
        units={holdings[openFund.symbol] ?? 0}
        onBack={() => setOpen(null)}
        onToggle={() => toggle(openFund.symbol)}
        onUnits={(units) => setUnits(openFund.symbol, units)}
      />
    );
  }

  const row = (fund: MutualFund) => (
    <FundRow
      key={fund.symbol}
      fund={fund}
      today={today}
      followed={fund.symbol in holdings}
      onOpen={() => setOpen(fund.symbol)}
      onToggle={() => toggle(fund.symbol)}
    />
  );

  return (
    <StateBanner state={banner(state)} onRetry={onRetry}>
      {snapshot && (
        <div className="space-y-2.5">
          <BazarSearch value={query} onChange={setQuery} placeholder={t("funds.search")} />

          {query.trim() ? (
            <section className="surface-card p-2.5">
              {matches.length === 0 ? (
                <p className="text-[11px] text-text-secondary">{t("funds.no-match")}</p>
              ) : (
                matches.map(row)
              )}
            </section>
          ) : (
            <>
              <YourFunds
                funds={Object.keys(holdings)
                  .map((symbol) => bySymbol.get(symbol))
                  .filter((fund): fund is MutualFund => Boolean(fund))}
                holdings={holdings}
                row={row}
              />

              <section className="surface-card p-2.5 pt-2">
                {/* The count rides on the tab row, where the IPO card keeps its own. */}
                <div className="relative">
                  {kinds.length > 1 && (
                    <TabStrip
                      label={t("stocks.view-funds")}
                      value={shownKind}
                      onChange={setKind}
                      tabs={kinds.map((item) => ({ id: item.id, label: t(item.label) }))}
                    />
                  )}
                  <span className="absolute top-0 right-0 rounded-md bg-surface px-1.5 text-[10px] font-medium leading-4 tabular-nums text-text-secondary">
                    {listed.length}
                  </span>
                </div>
                {/* The right label sits over the figures, clear of the star column. */}
                <div className="mt-2 flex items-end justify-between gap-2 border-b border-[color:var(--color-divider)] pr-[34px] pb-1.5 pl-2 text-[10px] text-text-muted">
                  <span>{t("funds.col-fund")}</span>
                  <span className="text-right">{t(COLUMN[shownKind])}</span>
                </div>
                <div role={kinds.length > 1 ? "tabpanel" : undefined}>{listed.map(row)}</div>
              </section>
            </>
          )}

          <SourceNote label={t("funds.source")}>
            <SourceLink href={SOURCE_LINKS[snapshot.source] ?? SHAREHUB_LINK}>
              {snapshot.source}
            </SourceLink>
          </SourceNote>
        </div>
      )}
    </StateBanner>
  );
}

function YourFunds({
  funds,
  holdings,
  row,
}: {
  funds: MutualFund[];
  holdings: Record<string, number>;
  row: (fund: MutualFund) => ReactNode;
}) {
  const { t } = useSettings();

  const held = funds.filter((fund) => (holdings[fund.symbol] ?? 0) > 0);
  const total = held.reduce((sum, fund) => sum + (holdings[fund.symbol] ?? 0) * unitValue(fund), 0);
  // Only open-end NAVs move week to week in a way the holder is paid out on;
  // a closed-end fund's worth follows the market price instead.
  const moved = held.reduce((sum, fund) => {
    const move = fund.kind === "openEnd" ? navMove(fund) : null;
    return move ? sum + (holdings[fund.symbol] ?? 0) * move.change : sum;
  }, 0);

  return (
    <section className="surface-card p-2.5" aria-label={t("funds.yours")}>
      <p className="text-[11px] font-semibold text-text-secondary">{t("funds.yours")}</p>
      {funds.length === 0 ? (
        <p className="mt-1 text-[11px] text-text-secondary">{t("funds.empty-yours")}</p>
      ) : (
        <>
          {held.length > 0 && (
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="text-[22px] font-semibold tabular-nums">Rs {money.format(total)}</p>
              {Math.abs(moved) >= 0.005 && (
                <p
                  className={`text-[11px] font-medium tabular-nums ${moved > 0 ? "text-positive" : "text-holiday"}`}
                >
                  {moved > 0 ? "+" : "−"}Rs {money.format(Math.abs(moved))} {t("funds.this-week")}
                </p>
              )}
            </div>
          )}
          <div className="mt-0.5">{funds.map(row)}</div>
        </>
      )}
    </section>
  );
}
