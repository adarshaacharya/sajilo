export type MoverBoard = "gainers" | "losers" | "turnover" | "volume";

export type StockQuote = {
  symbol: string;
  companyName: string | null;
  ltp: number;
  previousClose: number;
  change: number;
  changePercent: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  vwap: number | null;
  volume: number | null;
  turnover: number;
  transactions: number | null;
  week52High: number | null;
  week52Low: number | null;
  average120Day: number | null;
  average180Day: number | null;
};

export type MarketIndex = {
  name: string;
  value: number;
  change: number;
  changePercent: number;
  turnover: number;
};

export type MarketMover = {
  board: MoverBoard;
  symbol: string;
  ltp: number;
  metric: number;
};

export type StockMarketSnapshot = {
  nepse: MarketIndex | null;
  subIndices: Array<MarketIndex>;
  movers: Array<MarketMover>;
  quotes: Array<StockQuote>;
  freshness: import("./Freshness").Freshness;
};
