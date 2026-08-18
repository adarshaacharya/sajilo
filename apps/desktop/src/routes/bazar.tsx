import { useCallback, useEffect, useState } from "react";
import { Card } from "../components/Card";
import { ICONS, Icon } from "../components/Icon";
import { Segmented } from "../components/Segmented";
import { type LoadStatus, StateBanner } from "../components/StateBanner";
import { api, type Bazar as BazarFeeds } from "../lib/ipc";
import { useSettings } from "../lib/settings";

type Translate = ReturnType<typeof useSettings>["t"];

import type { FuelPriceSnapshot } from "../types/api/FuelPriceSnapshot";
import type { LoadState } from "../types/api/LoadState";
import type { MetalRateSnapshot } from "../types/api/MetalRateSnapshot";
import type { VegetableMarketSnapshot } from "../types/api/VegetableMarketSnapshot";

type Tab = "metals" | "fuel" | "vegetables";

/** Nepali grouping is the Indian lakh/crore one, which `en-IN` already knows. */
const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/**
 * Adapts a Rust `LoadState<T>` to what `StateBanner` renders. Stale keeps its
 * value — a labelled old price beats an empty card.
 */
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

function loadedValue<T>(state: LoadState<T> | undefined): T | undefined {
  return state && (state.status === "fresh" || state.status === "stale") ? state.value : undefined;
}

function fetchedAt(freshness: { fetchedAt: string } | undefined): string | undefined {
  if (!freshness) return undefined;
  return new Date(freshness.fetchedAt).toLocaleString();
}

/** Price with its movement against the previous quote. */
function Row({
  name,
  unit,
  price,
  previous,
}: {
  name: string;
  unit: string;
  price: number;
  previous: number;
}) {
  const change = price - previous;
  const flat = Math.abs(change) < 0.005;
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/60 py-1.5 last:border-0">
      <div className="min-w-0">
        <p className="truncate">{name}</p>
        <p className="text-[11px] text-text-muted">{unit}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-semibold">Rs {money.format(price)}</p>
        {!flat && (
          <p className={`text-[11px] ${change > 0 ? "text-holiday" : "text-text-secondary"}`}>
            {change > 0 ? "▲" : "▼"} {money.format(Math.abs(change))}
          </p>
        )}
      </div>
    </div>
  );
}

const METAL_NAMES: Record<string, string> = {
  fineGold: "Fine gold",
  tejabiGold: "Tejabi gold",
  silver: "Silver",
};
const METAL_UNITS: Record<string, string> = { tola: "per tola", tenGram: "per 10 g" };
const FUEL_NAMES: Record<string, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  kerosene: "Kerosene",
  lpg: "LPG cylinder",
};
const FUEL_UNITS: Record<string, string> = {
  petrol: "per litre",
  diesel: "per litre",
  kerosene: "per litre",
  lpg: "per cylinder",
};
const MARKET_UNITS: Record<string, string> = {
  kilogram: "per kg",
  dozen: "per dozen",
  piece: "each",
};

function Metals({ snapshot }: { snapshot: MetalRateSnapshot }) {
  return (
    <div>
      {snapshot.rates.map((rate) => (
        <Row
          key={`${rate.metal}-${rate.unit}`}
          name={METAL_NAMES[rate.metal] ?? rate.metal}
          unit={METAL_UNITS[rate.unit] ?? rate.unit}
          price={rate.price}
          previous={rate.previousPrice}
        />
      ))}
    </div>
  );
}

function Fuel({ snapshot, t }: { snapshot: FuelPriceSnapshot; t: Translate }) {
  return (
    <div>
      {snapshot.prices.map((price) => (
        <Row
          key={price.fuel}
          name={FUEL_NAMES[price.fuel] ?? price.fuel}
          unit={FUEL_UNITS[price.fuel] ?? ""}
          price={price.price}
          previous={price.previousPrice}
        />
      ))}
      <p className="mt-1.5 text-[11px] text-text-muted">
        {t("bazar.effective-from")} {snapshot.effectiveFrom}
      </p>
    </div>
  );
}

function Vegetables({ snapshot, t }: { snapshot: VegetableMarketSnapshot; t: Translate }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? snapshot.prices.filter(
        (price) =>
          price.name.toLowerCase().includes(needle) ||
          (price.englishName ?? "").toLowerCase().includes(needle),
      )
    : snapshot.prices;

  return (
    <div>
      <div className="relative mb-1.5">
        <Icon
          path={ICONS.search}
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("bazar.search-produce")}
          className="h-8 w-full rounded-md border border-border bg-surface pl-7 pr-2 text-[12px]"
        />
      </div>
      <p className="mb-1 text-[11px] text-text-muted">{t("bazar.wholesale-note")}</p>
      {matches.length === 0 && <p className="py-2 text-text-secondary">{t("bazar.no-match")}</p>}
      {matches.map((price) => (
        <div
          key={price.name}
          className="flex items-baseline justify-between gap-2 border-b border-border/60 py-1.5 last:border-0"
        >
          <div className="min-w-0">
            <p className="truncate">{price.englishName ?? price.name}</p>
            <p className="truncate text-[11px] text-text-muted">
              {price.englishName ? `${price.name} · ` : ""}
              {MARKET_UNITS[price.unit] ?? price.unit}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-semibold">Rs {money.format(price.average)}</p>
            <p className="text-[11px] text-text-muted">
              {money.format(price.minimum)}–{money.format(price.maximum)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Bazar() {
  const { t } = useSettings();
  const [tab, setTab] = useState<Tab>("metals");
  const [feeds, setFeeds] = useState<BazarFeeds>();

  const load = useCallback((refresh = false) => {
    setFeeds(undefined);
    api
      .getBazar(refresh)
      .then(setFeeds)
      .catch((error: unknown) => {
        const failed = { status: "failed", value: String(error) } as const;
        setFeeds({ metals: failed, fuel: failed, vegetables: failed });
      });
  }, []);

  // Rust caches the payload, so re-entering the screen costs no upstream fetch.
  useEffect(() => load(), [load]);

  const metals = loadedValue(feeds?.metals);
  const fuel = loadedValue(feeds?.fuel);
  const vegetables = loadedValue(feeds?.vegetables);

  return (
    <div className="space-y-3">
      <Segmented
        label={t("screen.bazar")}
        value={tab}
        onChange={setTab}
        options={[
          { id: "metals", label: t("bazar.metals"), icon: ICONS.gold },
          { id: "fuel", label: t("bazar.fuel"), icon: ICONS.fuel },
          { id: "vegetables", label: t("bazar.vegetables"), icon: ICONS.vegetables },
        ]}
      />

      {tab === "metals" && (
        <Card title={t("bazar.metals")}>
          <StateBanner
            state={banner(feeds?.metals, fetchedAt(metals?.freshness))}
            onRetry={() => load(true)}
          >
            {metals && <Metals snapshot={metals} />}
          </StateBanner>
        </Card>
      )}

      {tab === "fuel" && (
        <Card title={t("bazar.fuel")}>
          <StateBanner
            state={banner(feeds?.fuel, fetchedAt(fuel?.freshness))}
            onRetry={() => load(true)}
          >
            {fuel && <Fuel snapshot={fuel} t={t} />}
          </StateBanner>
        </Card>
      )}

      {tab === "vegetables" && (
        <Card title={t("bazar.vegetables")}>
          <StateBanner
            state={banner(feeds?.vegetables, fetchedAt(vegetables?.freshness))}
            onRetry={() => load(true)}
          >
            {vegetables && <Vegetables snapshot={vegetables} t={t} />}
          </StateBanner>
        </Card>
      )}
    </div>
  );
}
