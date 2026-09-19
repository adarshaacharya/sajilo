import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import useSWR from "swr";
import { useHeaderSlot } from "../../shared/components/header-slot";
import { Icon } from "../../shared/components/icon";
import { Segmented } from "../../shared/components/segmented";
import { type LoadStatus, StateBanner } from "../../shared/components/state-banner";
import { TabStrip } from "../../shared/components/tab-strip";
import { useSettings } from "../../shared/context/settings-context";
import { api, type Bazar as BazarFeeds } from "../../shared/lib/ipc";
import { catchAsFailed, fetchedAtLabel, loadedValue } from "../../shared/lib/load-state";
import { usePersistedString } from "../../shared/lib/persisted";
import type { DividendSnapshot } from "../../types/api/DividendSnapshot";
import type { ForexSnapshot } from "../../types/api/ForexSnapshot";
import type { IndexIntraday } from "../../types/api/IndexIntraday";
import type { IpoSnapshot } from "../../types/api/IpoSnapshot";
import type { LoadState } from "../../types/api/LoadState";
import type { MutualFundSnapshot } from "../../types/api/MutualFundSnapshot";
import type { StockMarketSnapshot } from "../../types/api/StockMarketSnapshot";
import { ForexRates } from "../forex/forex";
import { FuelTab } from "./_components/fuel";
import { FundsLink } from "./_components/funds-link";
import { MetalsTab } from "./_components/metals";
import { MutualFunds } from "./_components/mutual-funds";
import { Stocks } from "./_components/stocks";
import { VegetablesTab } from "./_components/vegetables";
import { LIVE_REFRESH_MS } from "./_lib/live";

type Tab = "stocks" | "metals" | "fuel" | "vegetables" | "forex";

/** Also the set `?tab=` accepts, so anything that links into this screen — the
 * tray, the landing page — can open it on the panel it means. */
const TABS: Tab[] = ["stocks", "forex", "metals", "fuel", "vegetables"];

/** The stocks tab's two halves; `?view=` opens either, and the last one used is remembered. */
type StocksView = "nepse" | "funds";
const STOCKS_VIEWS: StocksView[] = ["nepse", "funds"];
const STOCKS_VIEW_KEY = "stocksView";

function banner<T>(state: LoadState<T> | undefined, freshness?: string): LoadStatus {
  if (!state) return { status: "loading" };
  switch (state.status) {
    case "stale":
      return { status: "stale", since: freshness };
    case "failed":
      return { status: "failed", message: state.value };
    default:
      return { status: state.status };
  }
}

function fetchIpos(refresh = false): Promise<LoadState<IpoSnapshot>> {
  return catchAsFailed(api.getIpos(refresh));
}

function fetchDividends(refresh = false): Promise<LoadState<DividendSnapshot>> {
  return catchAsFailed(api.getDividends(refresh));
}

function fetchMutualFunds(refresh = false): Promise<LoadState<MutualFundSnapshot>> {
  return catchAsFailed(api.getMutualFunds(refresh));
}

function fetchForex(refresh = false): Promise<LoadState<ForexSnapshot>> {
  return catchAsFailed(api.getForex(refresh));
}

function fetchIntraday(refresh = false): Promise<LoadState<IndexIntraday>> {
  return catchAsFailed(api.getNepseIntraday(refresh));
}

function fetchFeeds(refresh = false): Promise<BazarFeeds> {
  return api.getBazar(refresh).catch((error: unknown): BazarFeeds => {
    const failed = { status: "failed", value: String(error) } as const;
    return { metals: failed, fuel: failed, vegetables: failed };
  });
}

export function Bazar() {
  const { t, modules } = useSettings();
  const { search } = useLocation();
  const linked = useMemo(() => new URLSearchParams(search), [search]);
  const [tab, setTab] = useState<Tab>(() => {
    const requested = new URLSearchParams(search).get("tab");
    return TABS.includes(requested as Tab) ? (requested as Tab) : "stocks";
  });
  // A link to the Forex tab while Forex is switched off lands on Stocks.
  useEffect(() => {
    if (tab === "forex" && !modules.forexEnabled) setTab("stocks");
  }, [tab, modules.forexEnabled]);
  const linkedView = linked.get("view") as StocksView | null;
  const [savedView, saveView] = usePersistedString(STOCKS_VIEW_KEY);
  const [pickedView, setPickedView] = useState<StocksView | null>(
    linkedView && STOCKS_VIEWS.includes(linkedView) ? linkedView : null,
  );
  const view: StocksView =
    pickedView ??
    (STOCKS_VIEWS.includes(savedView as StocksView) ? (savedView as StocksView) : "nepse");
  const pickView = (next: StocksView) => {
    setPickedView(next);
    saveView(next);
  };
  const {
    data: feeds,
    isValidating: loadingFeeds,
    mutate: mutateFeeds,
  } = useSWR("bazar-feeds", () => fetchFeeds(false));
  // While NEPSE is trading the board moves every minute; a screen left open
  // follows it. Closed, nothing changes until the next session.
  const [marketOpen, setMarketOpen] = useState(false);
  const inSession = marketOpen ? { refreshInterval: LIVE_REFRESH_MS } : {};
  const {
    data: stocks,
    isValidating: loadingStocks,
    mutate: mutateStocks,
  } = useSWR("bazar-stocks", () => catchAsFailed(api.getStocks(false)), inSession);
  useEffect(() => {
    setMarketOpen(loadedValue(stocks)?.marketStatus?.isOpen ?? false);
  }, [stocks]);
  // CDSC is only asked while the stocks tab is showing; its cache answers
  // everything else.
  const {
    data: ipos,
    isValidating: loadingIpos,
    mutate: mutateIpos,
  } = useSWR(tab === "stocks" ? "bazar-ipos" : null, () => fetchIpos(false));
  const {
    data: dividends,
    isValidating: loadingDividends,
    mutate: mutateDividends,
  } = useSWR(tab === "stocks" ? "bazar-dividends" : null, () => fetchDividends(false));
  const {
    data: intraday,
    isValidating: loadingIntraday,
    mutate: mutateIntraday,
  } = useSWR(
    tab === "stocks" ? "bazar-nepse-intraday" : null,
    () => fetchIntraday(false),
    inSession,
  );

  // Asked for on the NEPSE view too: its footer link says how fresh the NAVs are.
  const {
    data: funds,
    isValidating: loadingFunds,
    mutate: mutateFunds,
  } = useSWR(tab === "stocks" ? "bazar-mutual-funds" : null, () => fetchMutualFunds(false));

  const retryFunds = useCallback(
    () => void mutateFunds(fetchMutualFunds(true), { revalidate: false }),
    [mutateFunds],
  );
  const retryIpos = useCallback(
    () => void mutateIpos(fetchIpos(true), { revalidate: false }),
    [mutateIpos],
  );
  const retryDividends = useCallback(
    () => void mutateDividends(fetchDividends(true), { revalidate: false }),
    [mutateDividends],
  );
  // Same key the background refresh warms, so the tab opens on a fresh copy.
  const {
    data: forex,
    isValidating: loadingForex,
    mutate: mutateForex,
  } = useSWR(tab === "forex" ? "forex" : null, () => fetchForex(false));
  const retryForex = useCallback(
    () => void mutateForex(fetchForex(true), { revalidate: false }),
    [mutateForex],
  );
  const retryIntraday = useCallback(
    () => void mutateIntraday(fetchIntraday(true), { revalidate: false }),
    [mutateIntraday],
  );

  const loading =
    tab === "stocks"
      ? view === "funds"
        ? loadingFunds
        : loadingStocks || loadingIpos || loadingDividends || loadingIntraday
      : tab === "forex"
        ? loadingForex
        : loadingFeeds;

  const load = useCallback(
    (refresh = false) => {
      if (refresh) {
        mutateFeeds(fetchFeeds(true), { revalidate: false });
        mutateStocks(catchAsFailed<StockMarketSnapshot>(api.getStocks(true)), {
          revalidate: false,
        });
        if (tab === "stocks") {
          mutateIpos(fetchIpos(true), { revalidate: false });
          mutateDividends(fetchDividends(true), { revalidate: false });
          mutateIntraday(fetchIntraday(true), { revalidate: false });
          mutateFunds(fetchMutualFunds(true), { revalidate: false });
        }
        if (tab === "forex") mutateForex(fetchForex(true), { revalidate: false });
      } else {
        mutateFeeds();
        mutateStocks();
        mutateIpos();
        mutateDividends();
        mutateIntraday();
        mutateFunds();
        mutateForex();
      }
    },
    [
      mutateDividends,
      mutateFeeds,
      mutateForex,
      mutateFunds,
      mutateIntraday,
      mutateIpos,
      mutateStocks,
      tab,
    ],
  );

  const metals = loadedValue(feeds?.metals);
  const fuel = loadedValue(feeds?.fuel);
  const vegetables = loadedValue(feeds?.vegetables);

  const refreshButton = useMemo(
    () => (
      <button
        type="button"
        onClick={() => load(true)}
        disabled={loading}
        aria-label={t("action.refresh")}
        className="icon-btn shrink-0"
      >
        <Icon name="refresh" className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
      </button>
    ),
    [load, loading, t],
  );

  useHeaderSlot(refreshButton);

  return (
    <div className="min-w-0 space-y-2.5">
      <Segmented
        label={t("screen.bazar")}
        value={tab}
        onChange={setTab}
        options={[
          { id: "stocks", label: t("bazar.stocks"), icon: "interest" as const },
          // Hidden with the module: a Settings switch that turns Forex off
          // should leave nothing of it behind.
          ...(modules.forexEnabled
            ? [{ id: "forex" as const, label: t("feature.forex"), icon: "forex" as const }]
            : []),
          { id: "metals", label: t("bazar.metals"), icon: "gold" as const },
          { id: "fuel", label: t("bazar.fuel"), icon: "fuel" as const },
          { id: "vegetables", label: t("bazar.vegetables"), icon: "vegetables" as const },
        ]}
      />

      {tab === "stocks" && (
        <TabStrip
          label={t("stocks.view")}
          value={view}
          onChange={pickView}
          tabs={[
            { id: "nepse" as const, label: t("stocks.view-nepse") },
            { id: "funds" as const, label: t("stocks.view-funds") },
          ]}
        />
      )}

      {tab === "stocks" && view === "funds" && (
        <MutualFunds
          state={funds}
          onRetry={retryFunds}
          linkedFund={linked.get("fund")}
          settingUpSip={linked.get("setup") === "sip"}
        />
      )}

      {tab === "stocks" && view === "nepse" && (
        <Stocks
          state={stocks}
          ipoState={ipos}
          dividendState={dividends}
          intradayState={intraday}
          onRetry={() => load(true)}
          onRetryIpos={retryIpos}
          onRetryDividends={retryDividends}
          onRetryIntraday={retryIntraday}
          linkedIpo={linked.get("ipo")}
          linkedIpoList={linked.has("ipos")}
          footer={<FundsLink state={funds} onOpen={() => pickView("funds")} />}
        />
      )}

      {tab === "metals" && (
        <StateBanner
          state={banner(feeds?.metals, fetchedAtLabel(metals?.freshness))}
          onRetry={() => load(true)}
        >
          {metals && <MetalsTab snapshot={metals} />}
        </StateBanner>
      )}

      {tab === "fuel" && (
        <StateBanner
          state={banner(feeds?.fuel, fetchedAtLabel(fuel?.freshness))}
          onRetry={() => load(true)}
        >
          {fuel && <FuelTab snapshot={fuel} />}
        </StateBanner>
      )}

      {tab === "forex" && <ForexRates state={forex} onRetry={retryForex} />}

      {tab === "vegetables" && (
        <StateBanner
          state={banner(feeds?.vegetables, fetchedAtLabel(vegetables?.freshness))}
          onRetry={() => load(true)}
        >
          {vegetables && <VegetablesTab snapshot={vegetables} />}
        </StateBanner>
      )}
    </div>
  );
}
