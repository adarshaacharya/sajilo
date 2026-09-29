import { useEffect, useState } from "react";
import { api } from "../../../shared/lib/ipc";
import type { CryptoCoin } from "../../../types/api/CryptoCoin";
import type { ForexSnapshot } from "../../../types/api/ForexSnapshot";

/**
 * Presentation helpers for the crypto view. Every price is in US dollars, the
 * currency the sources quote; rupees are shown beside them at NRB's rate.
 */

/** The chart ranges the provider serves, in days. */
export const CHART_RANGES = [
  { days: 1, label: "1D" },
  { days: 7, label: "7D" },
  { days: 30, label: "1M" },
  { days: 365, label: "1Y" },
] as const;

export type ChartDays = (typeof CHART_RANGES)[number]["days"];

/**
 * Dollars with as many decimals as the price needs: $64,210 for bitcoin,
 * $0.1234 for a coin under a dollar, $0.00001234 for one far under it.
 */
export function usd(value: number): string {
  const size = Math.abs(value);
  const digits = size >= 1000 ? 0 : size >= 1 ? 2 : size >= 0.01 ? 4 : 8;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: size >= 1000 ? 0 : Math.min(digits, 2),
    maximumFractionDigits: digits,
  }).format(value);
}

/** $1.23T, $845.2B, $12.4M — the way market pages state sizes. */
export function usdCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: value >= 1e3 ? 2 : 0,
  }).format(value);
}

/** Coin amounts: 19.8M BTC, 0.25 ETH. */
export function amountCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 1e6 ? "compact" : "standard",
    maximumFractionDigits: value >= 1e6 ? 2 : 8,
  }).format(value);
}

export function percentText(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/** NPR paid for one US dollar, from NRB's latest table; null until it loads. */
export function nprPerUsd(forex: ForexSnapshot | undefined): number | null {
  const rate = forex?.rates.find((row) => row.currencyCode === "USD");
  return rate && rate.unit > 0 ? rate.buy / rate.unit : null;
}

export function searchCoins(coins: readonly CryptoCoin[], query: string): CryptoCoin[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...coins];
  return coins.filter(
    (coin) =>
      coin.symbol.toLowerCase().includes(needle) || coin.name.toLowerCase().includes(needle),
  );
}

export type CryptoList = "top" | "gainers" | "losers";

/** The market list: by rank, or by the day's move with coins that have none left out. */
export function listCoins(coins: readonly CryptoCoin[], list: CryptoList): CryptoCoin[] {
  if (list === "top") {
    return [...coins].sort((a, b) => (a.rank ?? Number.MAX_VALUE) - (b.rank ?? Number.MAX_VALUE));
  }
  const up = list === "gainers";
  return coins
    .filter((coin) => coin.change24h != null && (up ? coin.change24h > 0 : coin.change24h < 0))
    .sort((a, b) => {
      const gap = (b.change24h ?? 0) - (a.change24h ?? 0);
      return up ? gap : -gap;
    });
}

/** One kept coin: how much is held, and what it cost on average, per coin in dollars. */
export type CryptoHolding = { amount: number; cost: number | null };

/** What a holding would lose or make if sold now; null without a cost to compare. */
export function holdingGain(holding: CryptoHolding, price: number): number | null {
  if (holding.cost == null || holding.amount <= 0) return null;
  return holding.amount * (price - holding.cost);
}

/** What the day's move did to a holding, in dollars. */
export function holdingDayMove(holding: CryptoHolding, coin: CryptoCoin): number | null {
  if (coin.change24h == null || holding.amount <= 0) return null;
  const before = coin.price / (1 + coin.change24h / 100);
  return holding.amount * (coin.price - before);
}

const HOLDINGS_KEY = "cryptoHoldings";

function cleanNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * The coins the user keeps, with how much of each they hold and, if they said,
 * what they paid. A starred coin with nothing entered yet is stored at 0. Kept
 * on this device only, like the fund and stock watchlists.
 */
export function useCryptoHoldings() {
  const [holdings, setHoldings] = useState<Record<string, CryptoHolding>>({});

  useEffect(() => {
    let cancelled = false;
    api
      .getSetting<Record<string, unknown>>(HOLDINGS_KEY)
      .then((saved) => {
        if (cancelled || !saved || typeof saved !== "object") return;
        const clean: Record<string, CryptoHolding> = {};
        for (const [id, entry] of Object.entries(saved)) {
          if (!entry || typeof entry !== "object") continue;
          const { amount, cost } = entry as Record<string, unknown>;
          clean[id] = { amount: cleanNumber(amount) ?? 0, cost: cleanNumber(cost) };
        }
        setHoldings(clean);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (
    next: (current: Record<string, CryptoHolding>) => Record<string, CryptoHolding>,
  ) => {
    setHoldings((current) => {
      const resolved = next(current);
      api.setSetting(HOLDINGS_KEY, resolved).catch(() => {});
      return resolved;
    });
  };

  const toggle = (id: string) =>
    update((current) => {
      if (id in current) {
        const { [id]: _, ...rest } = current;
        return rest;
      }
      return { ...current, [id]: { amount: 0, cost: null } };
    });

  const set = (id: string, change: Partial<CryptoHolding>) =>
    update((current) => {
      const before = current[id] ?? { amount: 0, cost: null };
      const amount = cleanNumber(change.amount ?? before.amount) ?? 0;
      const cost = "cost" in change ? cleanNumber(change.cost) : before.cost;
      return { ...current, [id]: { amount, cost: cost && cost > 0 ? cost : null } };
    });

  /** Moves holdings to new ids, keeping what was entered under the old. */
  const rename = (map: Record<string, string>) =>
    update((current) => {
      const next: Record<string, CryptoHolding> = {};
      for (const [id, holding] of Object.entries(current)) next[map[id] ?? id] = holding;
      return next;
    });

  return { holdings, toggle, set, rename };
}
