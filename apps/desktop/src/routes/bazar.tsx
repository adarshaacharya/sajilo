import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { useHeaderSlot } from "../components/HeaderSlot";
import { Segmented } from "../components/Segmented";
import { type LoadStatus, StateBanner } from "../components/StateBanner";
import { api, type Bazar as BazarFeeds } from "../lib/ipc";
import { fetchedAtLabel, loadedValue } from "../lib/loadState";
import { useSettings } from "../lib/settings";
import { FuelTab } from "./bazar/Fuel";
import { MetalsTab } from "./bazar/Metals";
import { Stocks } from "./bazar/Stocks";
import { VegetablesTab } from "./bazar/Vegetables";
import type { LoadState } from "../types/api/LoadState";
import type { StockMarketSnapshot } from "../types/api/StockMarketSnapshot";

type Tab = "stocks" | "metals" | "fuel" | "vegetables";

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

export function Bazar() {
  const { t } = useSettings();
  const [tab, setTab] = useState<Tab>("stocks");
  const [feeds, setFeeds] = useState<BazarFeeds>();
  const [stocks, setStocks] = useState<LoadState<StockMarketSnapshot>>();

  const loadingFeeds = !feeds || Object.values(feeds).some((feed) => !feed || feed.status === "loading");
  const loadingStocks = !stocks || stocks.status === "loading";
  const loading = tab === "stocks" ? loadingStocks : loadingFeeds;

  const load = useCallback((refresh = false) => {
    setFeeds(undefined);
    setStocks(undefined);
    api
      .getBazar(refresh)
      .then(setFeeds)
      .catch((error: unknown) => {
        const failed = { status: "failed", value: String(error) } as const;
        setFeeds({ metals: failed, fuel: failed, vegetables: failed });
      });
    api
      .getStocks(refresh)
      .then(setStocks)
      .catch((error: unknown) => setStocks({ status: "failed", value: String(error) }));
  }, []);

  useEffect(() => load(), [load]);

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
    <div className="space-y-2.5">
      <Segmented
        label={t("screen.bazar")}
        value={tab}
        onChange={setTab}
        options={[
          { id: "stocks", label: t("bazar.stocks"), icon: "interest" as const },
          { id: "metals", label: t("bazar.metals"), icon: "gold" as const },
          { id: "fuel", label: t("bazar.fuel"), icon: "fuel" as const },
          { id: "vegetables", label: t("bazar.vegetables"), icon: "vegetables" as const },
        ]}
      />

      {tab === "stocks" && <Stocks state={stocks} onRetry={() => load(true)} />}

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
