import { type ReactNode, useMemo, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { SearchField } from "../../../shared/components/search-field";
import { type LoadStatus, StateBanner } from "../../../shared/components/state-banner";
import { TabStrip } from "../../../shared/components/tab-strip";
import { useSettings } from "../../../shared/context/settings-context";
import { loadedValue } from "../../../shared/lib/load-state";
import type { FundKind } from "../../../types/api/FundKind";
import type { LoadState } from "../../../types/api/LoadState";
import type { MutualFund } from "../../../types/api/MutualFund";
import type { MutualFundSnapshot } from "../../../types/api/MutualFundSnapshot";
import type { SipStatus } from "../../../types/api/SipStatus";
import { money, sourceStamp } from "../_lib/format";
import {
  byDiscount,
  byMaturity,
  byWeeklyMove,
  navMove,
  searchFunds,
  sipDueDate,
  sipIsClose,
  sipWhen,
  unitValue,
  useFundHoldings,
  useSips,
} from "../_lib/funds";
import { nepalToday } from "../_lib/ipo";
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
  linkedFund,
  settingUpSip = false,
}: {
  state: LoadState<MutualFundSnapshot> | undefined;
  onRetry: () => void;
  linkedFund?: string | null;
  settingUpSip?: boolean;
}) {
  const { t } = useSettings();
  const snapshot = loadedValue(state);
  const sips = useSips();
  const { holdings, toggle, setUnits } = useFundHoldings();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<FundKind>("openEnd");
  const [open, setOpen] = useState<string | null>(linkedFund ?? null);
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

  const row = (fund: MutualFund, sip?: SipStatus) => (
    <FundRow
      key={fund.symbol}
      fund={fund}
      today={today}
      followed={fund.symbol in holdings}
      sip={sip}
      onOpen={() => setOpen(fund.symbol)}
      onToggle={() => toggle(fund.symbol)}
    />
  );

  return (
    <StateBanner state={banner(state)} onRetry={onRetry}>
      {snapshot && (
        <div className="space-y-2.5">
          {settingUpSip && (
            <div className="flex items-start gap-2 rounded-md bg-[color:color-mix(in_srgb,var(--color-accent-mark)_12%,transparent)] px-2.5 py-2 text-[11px] text-text-secondary">
              <Icon name="banknote" className="mt-px size-3.5 shrink-0 text-accent-mark" />
              <span>{t("keeper.sip.choose-fund")}</span>
            </div>
          )}
          <SearchField value={query} onChange={setQuery} placeholder={t("funds.search")} />

          {query.trim() ? (
            <section className="surface-card p-2.5">
              {matches.length === 0 ? (
                <p className="text-[11px] text-text-secondary">{t("funds.no-match")}</p>
              ) : (
                matches.map((fund) => row(fund))
              )}
            </section>
          ) : (
            <>
              <YourFunds
                funds={Object.keys(holdings)
                  .map((symbol) => bySymbol.get(symbol))
                  .filter((fund): fund is MutualFund => Boolean(fund))}
                holdings={holdings}
                sips={sips}
                row={row}
                onOpen={setOpen}
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
                <div className="mt-1" role={kinds.length > 1 ? "tabpanel" : undefined}>
                  {listed.map((fund) => row(fund))}
                </div>
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
  sips,
  row,
  onOpen,
}: {
  funds: MutualFund[];
  holdings: Record<string, number>;
  sips: ReturnType<typeof useSips>;
  row: (fund: MutualFund, sip?: SipStatus) => ReactNode;
  onOpen: (symbol: string) => void;
}) {
  const { t, language } = useSettings();
  // Soonest first from Rust, so the first close one is what the chip is about.
  const close = sips.sips.filter(sipIsClose);
  const next = close[0];
  const dueNow = sips.sips.filter((sip) => sip.days <= 0);

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
      <div className="flex min-h-[20px] items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-text-secondary">{t("funds.yours")}</p>
        {next && (
          <button
            type="button"
            onClick={() => onOpen(next.symbol)}
            className="shrink-0 rounded-md bg-[color-mix(in_srgb,var(--color-accent-mark)_16%,transparent)] px-1.5 text-[10px] font-semibold leading-5 text-[color:var(--color-accent-mark)]"
          >
            {close.length > 1
              ? t("funds.sip-chip-many").replace("{n}", String(close.length))
              : `${t("funds.sip-short")} ${sipWhen(t, next.days)}`}
          </button>
        )}
      </div>
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
          <div className="mt-0.5">{funds.map((fund) => row(fund, sips.of(fund.symbol)))}</div>
        </>
      )}
      {dueNow.map((sip) => (
        <SipDueCard
          key={sip.symbol}
          sip={sip}
          language={language}
          onPaid={() => sips.markPaid(sip.symbol)}
          onLater={() => sips.remindTomorrow(sip.symbol)}
        />
      ))}
    </section>
  );
}

/**
 * On the day, and for the two days after if it is still unpaid: the payment
 * with the two things to do about it. Marking it paid clears it until next
 * month; "tomorrow" sends one more reminder in the morning.
 */
function SipDueCard({
  sip,
  language,
  onPaid,
  onLater,
}: {
  sip: SipStatus;
  language: "en" | "ne";
  onPaid: () => void;
  onLater: () => void;
}) {
  const { t } = useSettings();
  const amount = sip.amount ? `Rs ${money.format(sip.amount)} · ` : "";
  return (
    <div className="mt-2 rounded-lg border border-[color:color-mix(in_srgb,var(--color-accent-mark)_45%,var(--color-border))] p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[12px] font-semibold">{sip.name}</p>
        <span className="shrink-0 text-[10px] font-semibold text-[color:var(--color-accent-mark)]">
          {sipWhen(t, sip.days)}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-text-muted tabular-nums">
        {amount}
        {sipDueDate(sip, language)}
      </p>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={onPaid}
          className="flex h-7 flex-1 items-center justify-center rounded-lg bg-accent-fill text-[11px] font-semibold text-accent-ink transition-opacity duration-150 hover:opacity-90 active:opacity-80"
        >
          {t("funds.sip-mark-paid")}
        </button>
        <button
          type="button"
          onClick={onLater}
          className="flex h-7 flex-1 items-center justify-center rounded-lg border border-[color:var(--color-control-border)] text-[11px] font-medium text-text-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-text"
        >
          {t("funds.sip-remind-tomorrow")}
        </button>
      </div>
    </div>
  );
}
