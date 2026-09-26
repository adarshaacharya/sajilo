import { type ReactNode, useMemo, useState } from "react";
import useSWR from "swr";
import { Icon } from "../../../shared/components/icon";
import { SearchField } from "../../../shared/components/search-field";
import { type LoadStatus, StateBanner } from "../../../shared/components/state-banner";
import { TabStrip } from "../../../shared/components/tab-strip";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { catchAsFailed, loadedValue } from "../../../shared/lib/load-state";
import type { CryptoCoin } from "../../../types/api/CryptoCoin";
import type { CryptoSnapshot } from "../../../types/api/CryptoSnapshot";
import type { LoadState } from "../../../types/api/LoadState";
import {
  amountCompact,
  type CryptoHolding,
  type CryptoList,
  holdingDayMove,
  holdingGain,
  listCoins,
  nprPerUsd,
  searchCoins,
  usd,
  useCryptoHoldings,
} from "../_lib/crypto";
import { money0, sourceStamp } from "../_lib/format";
import { CryptoDetail } from "./crypto-detail";
import { CryptoRow } from "./crypto-row";
import { SourceLink, SourceNote } from "./source-note";

const COINGECKO_LINK = "https://www.coingecko.com/";
const SOURCE_LINKS: Record<string, string> = {
  CoinGecko: COINGECKO_LINK,
  Kraken: "https://www.kraken.com/prices",
};

const LISTS = [
  { id: "top", label: "crypto.top" },
  { id: "gainers", label: "crypto.gainers" },
  { id: "losers", label: "crypto.losers" },
] as const;

function banner(state: LoadState<CryptoSnapshot> | undefined): LoadStatus {
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
 * The crypto view: the coins the user keeps, with what they hold worth now,
 * above the market's top coins. Prices are in US dollars, the way every
 * source quotes them, with rupees beside at NRB's rate for anyone reading in
 * NPR. Nothing here buys or sells; it is for following the market.
 */
export function Crypto({
  state,
  onRetry,
}: {
  state: LoadState<CryptoSnapshot> | undefined;
  onRetry: () => void;
}) {
  const { t } = useSettings();
  const snapshot = loadedValue(state);
  const { holdings, toggle, set } = useCryptoHoldings();
  // The same cache the Forex tab reads, so this rarely asks NRB itself.
  const { data: forex } = useSWR("forex", () => catchAsFailed(api.getForex(false)));
  const nprRate = nprPerUsd(loadedValue(forex));
  const [query, setQuery] = useState("");
  const [list, setList] = useState<CryptoList>("top");
  const [open, setOpen] = useState<string | null>(null);

  const coins = snapshot?.coins ?? [];
  const byId = useMemo(() => new Map(coins.map((coin) => [coin.id, coin])), [coins]);
  const listed = useMemo(() => listCoins(coins, list), [coins, list]);
  const matches = useMemo(() => (query.trim() ? searchCoins(coins, query) : []), [coins, query]);

  const openCoin = open ? byId.get(open) : undefined;
  if (openCoin) {
    return (
      <CryptoDetail
        coin={openCoin}
        followed={openCoin.id in holdings}
        holding={holdings[openCoin.id] ?? { amount: 0, cost: null }}
        nprRate={nprRate}
        onBack={() => setOpen(null)}
        onToggle={() => toggle(openCoin.id)}
        onHolding={(change) => set(openCoin.id, change)}
      />
    );
  }

  const row = (coin: CryptoCoin, detail?: string) => (
    <CryptoRow
      key={coin.id}
      coin={coin}
      followed={coin.id in holdings}
      detail={detail}
      onOpen={() => setOpen(coin.id)}
      onToggle={() => toggle(coin.id)}
    />
  );

  return (
    <div className="space-y-2.5">
      <StateBanner state={banner(state)} onRetry={onRetry}>
        {snapshot && (
          <div className="space-y-2.5">
            <SearchField value={query} onChange={setQuery} placeholder={t("crypto.search")} />

            {query.trim() ? (
              <section className="surface-card p-2.5">
                {matches.length === 0 ? (
                  <p className="text-[11px] text-text-secondary">{t("crypto.no-match")}</p>
                ) : (
                  matches.map((coin) => row(coin))
                )}
              </section>
            ) : (
              <>
                <YourCoins
                  coins={Object.keys(holdings)
                    .map((id) => byId.get(id))
                    .filter((coin): coin is CryptoCoin => Boolean(coin))}
                  holdings={holdings}
                  nprRate={nprRate}
                  row={row}
                />

                <section className="surface-card p-2.5 pt-2">
                  <div className="relative">
                    <TabStrip
                      label={t("stocks.view-crypto")}
                      value={list}
                      onChange={setList}
                      tabs={LISTS.map((item) => ({ id: item.id, label: t(item.label) }))}
                    />
                    <span className="absolute top-0 right-0 rounded-md bg-surface px-1.5 text-[10px] font-medium leading-4 tabular-nums text-text-secondary">
                      {listed.length}
                    </span>
                  </div>
                  <div className="mt-1" role="tabpanel">
                    {listed.length === 0 ? (
                      <p className="px-2 py-2 text-[11px] text-text-secondary">
                        {t("crypto.no-movers")}
                      </p>
                    ) : (
                      listed.map((coin) => row(coin))
                    )}
                  </div>
                </section>
              </>
            )}

            <SourceNote label={t("crypto.updated")} stamp={sourceStamp(snapshot.freshness)}>
              <SourceLink href={SOURCE_LINKS[snapshot.source] ?? COINGECKO_LINK}>
                {t("crypto.source").replace("{source}", snapshot.source)}
              </SourceLink>
            </SourceNote>
          </div>
        )}
      </StateBanner>
      <p className="flex items-start gap-1.5 px-0.5 text-[10px] leading-snug text-text-muted">
        <Icon name="info" className="mt-px size-3 shrink-0" />
        <span>{t("crypto.note")}</span>
      </p>
    </div>
  );
}

function YourCoins({
  coins,
  holdings,
  nprRate,
  row,
}: {
  coins: CryptoCoin[];
  holdings: Record<string, CryptoHolding>;
  nprRate: number | null;
  row: (coin: CryptoCoin, detail?: string) => ReactNode;
}) {
  const { t } = useSettings();
  const held = coins.filter((coin) => (holdings[coin.id]?.amount ?? 0) > 0);
  const total = held.reduce((sum, coin) => sum + (holdings[coin.id]?.amount ?? 0) * coin.price, 0);
  const moved = held.reduce((sum, coin) => {
    const holding = holdings[coin.id];
    const move = holding ? holdingDayMove(holding, coin) : null;
    return move == null ? sum : sum + move;
  }, 0);
  // Gain is only summed over coins with a cost, against what those cost.
  const costed = held.filter((coin) => holdings[coin.id]?.cost != null);
  const gain = costed.reduce((sum, coin) => {
    const holding = holdings[coin.id];
    return sum + (holding ? (holdingGain(holding, coin.price) ?? 0) : 0);
  }, 0);

  const detail = (coin: CryptoCoin) => {
    const amount = holdings[coin.id]?.amount ?? 0;
    return amount > 0
      ? `${amountCompact(amount)} ${coin.symbol} · ${usd(amount * coin.price)}`
      : undefined;
  };

  return (
    <section className="surface-card p-2.5" aria-label={t("crypto.yours")}>
      <p className="text-[11px] font-semibold text-text-secondary">{t("crypto.yours")}</p>
      {coins.length === 0 ? (
        <p className="mt-1 text-[11px] text-text-secondary">{t("crypto.empty-yours")}</p>
      ) : (
        <>
          {held.length > 0 && (
            <div className="mt-1 flex items-end justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[22px] font-semibold leading-tight tabular-nums">{usd(total)}</p>
                {nprRate != null && (
                  <p className="text-[10px] text-text-muted tabular-nums">
                    ≈ Rs {money0.format(total * nprRate)}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right text-[11px] font-medium tabular-nums">
                {Math.abs(moved) >= 0.005 && (
                  <p className={moved > 0 ? "text-positive" : "text-holiday"}>
                    {moved > 0 ? "+" : "−"}
                    {usd(Math.abs(moved))} {t("crypto.today")}
                  </p>
                )}
                {costed.length > 0 && Math.abs(gain) >= 0.005 && (
                  <p className={gain > 0 ? "text-positive" : "text-holiday"}>
                    {gain > 0 ? "+" : "−"}
                    {usd(Math.abs(gain))} {t("crypto.overall")}
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="mt-0.5">{coins.map((coin) => row(coin, detail(coin)))}</div>
        </>
      )}
    </section>
  );
}
