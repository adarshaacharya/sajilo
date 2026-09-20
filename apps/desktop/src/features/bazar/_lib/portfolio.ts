import type { StockPortfolio } from "../../../types/api/StockPortfolio";
import type { StockPosition } from "../../../types/api/StockPosition";
import { money } from "./format";

/** `+Rs 1,200` / `-Rs 7,483.75` — a signed rupee amount, never a bare number. */
export function signedMoney(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}Rs ${money.format(Math.abs(value))}`;
}

/** Profit or loss against what was put in, as a percentage. */
export function profitPercent(profit: number | null, invested: number): number | null {
  if (profit == null || invested <= 0) return null;
  return (profit / invested) * 100;
}

export function signedPercent(percent: number): string {
  return `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
}

/** Companies still owned, largest holding first. */
export function heldPositions(portfolio: StockPortfolio | undefined): StockPosition[] {
  return (portfolio?.positions ?? [])
    .filter((position) => position.quantity > 0)
    .sort((a, b) => (b.marketValue ?? b.invested) - (a.marketValue ?? a.invested));
}
