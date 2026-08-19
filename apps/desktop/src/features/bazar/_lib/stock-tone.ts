import type { StockMarketSnapshot } from "../../../types/api/StockMarketSnapshot";
import type { StockQuote } from "../../../types/api/StockQuote";
import { money } from "./format";

export function quoteOf(snapshot: StockMarketSnapshot, symbol: string): StockQuote | undefined {
  return snapshot.quotes.find((q) => q.symbol.toLowerCase() === symbol.toLowerCase());
}

export function searchQuotes(snapshot: StockMarketSnapshot, query: string): StockQuote[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  return snapshot.quotes
    .filter(
      (q) =>
        q.symbol.toLowerCase().includes(trimmed) ||
        (q.companyName?.toLowerCase().includes(trimmed) ?? false),
    )
    .sort((a, b) => {
      const aSym = a.symbol.toLowerCase().includes(trimmed);
      const bSym = b.symbol.toLowerCase().includes(trimmed);
      if (aSym !== bSym) return aSym ? -1 : 1;
      return a.symbol.localeCompare(b.symbol);
    });
}

export function changeTone(change: number): string {
  if (Math.abs(change) < 0.005) return "text-text-muted";
  return change > 0 ? "text-[color:var(--color-accent-mark)]" : "text-holiday";
}

export function percentText(change: number, percent: number): string {
  const sign = change > 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}

export function changeText(change: number, percent: number): string {
  const sign = change > 0 ? "+" : "";
  return `${sign}${money.format(change)} (${sign}${percent.toFixed(2)}%)`;
}

export function shortSectorName(name: string): string {
  return name
    .replace(/ SubIndex$/i, "")
    .replace(/ Sub Index$/i, "")
    .replace(/ Index$/i, "");
}

export function week52Position(quote: StockQuote): number | null {
  if (quote.week52High == null || quote.week52Low == null || quote.week52High <= quote.week52Low) {
    return null;
  }
  return Math.min(
    1,
    Math.max(0, (quote.ltp - quote.week52Low) / (quote.week52High - quote.week52Low)),
  );
}
