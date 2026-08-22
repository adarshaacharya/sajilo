import { useCallback, useMemo, useState } from "react";
import { useLocation } from "react-router";
import useSWR from "swr";
import { useHeaderSlot } from "../../shared/components/header-slot";
import { Icon } from "../../shared/components/icon";
import { Segmented } from "../../shared/components/segmented";
import { type LoadStatus, StateBanner } from "../../shared/components/state-banner";
import { useSettings } from "../../shared/context/settings-context";
import { api, type Bazar as BazarFeeds } from "../../shared/lib/ipc";
import { catchAsFailed, fetchedAtLabel, loadedValue } from "../../shared/lib/load-state";
import type { LoadState } from "../../types/api/LoadState";
import type { StockMarketSnapshot } from "../../types/api/StockMarketSnapshot";
import { FuelTab } from "./_components/fuel";
import { MetalsTab } from "./_components/metals";
import { Stocks } from "./_components/stocks";
import { VegetablesTab } from "./_components/vegetables";

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

function fetchFeeds(refresh = false): Promise<BazarFeeds> {
  return api.getBazar(refresh).catch((error: unknown): BazarFeeds => {
    const failed = { status: "failed", value: String(error) } as const;
    return { metals: failed, fuel: failed, vegetables: failed };
  });
}

export function Bazar() {
  const { t } = useSettings();
  const { search } = useLocation();
  const [tab, setTab] = useState<Tab>(() =>
    new URLSearchParams(search).get("tab") === "metals" ? "metals" : "stocks",
  );
  const {
    data: feeds,
    isValidating: loadingFeeds,
    mutate: mutateFeeds,
  } = useSWR("bazar-feeds", () => fetchFeeds(false));
  const {
    data: stocks,
    isValidating: loadingStocks,
    mutate: mutateStocks,
  } = useSWR("bazar-stocks", () => catchAsFailed(api.getStocks(false)));

  const loading = tab === "stocks" ? loadingStocks : loadingFeeds;

  const load = useCallback(
    (refresh = false) => {
      if (refresh) {
        mutateFeeds(fetchFeeds(true), { revalidate: false });
        mutateStocks(catchAsFailed<StockMarketSnapshot>(api.getStocks(true)), {
          revalidate: false,
        });
      } else {
        mutateFeeds();
        mutateStocks();
      }
    },
    [mutateFeeds, mutateStocks],
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
          { id: "metals", label: t("bazar.metals"), icon: "gold" as const },
          { id: "fuel", label: t("bazar.fuel"), icon: "fuel" as const },
          { id: "vegetables", label: t("bazar.vegetables"), icon: "vegetables" as const },
        ]}
        scrollable={false}
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
