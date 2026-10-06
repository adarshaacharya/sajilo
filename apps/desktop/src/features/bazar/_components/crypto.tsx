import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Icon } from "../../../shared/components/icon";
import { SearchField } from "../../../shared/components/search-field";
import { type LoadStatus, StateBanner } from "../../../shared/components/state-banner";
import { TabStrip } from "../../../shared/components/tab-strip";
import { useSettings } from "../../../shared/context/settings-context";
import { openExternalLink } from "../../../shared/lib/external-link";
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
import { CryptoRow, SearchHitRow } from "./crypto-row";

const COINPAPRIKA_LINK = "https://coinpaprika.com/";
const SOURCE_LINKS: Record<string, string> = {
  CoinPaprika: COINPAPRIKA_LINK,
  Binance: "https://www.binance.com/en/markets/overview",
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
  linkedCoin,
}: {
  state: LoadState<CryptoSnapshot> | undefined;
  onRetry: () => void;
  /** `?coin=` opens that coin's page, by its CoinPaprika id (`btc-bitcoin`). */
  linkedCoin?: string | null;
}) {
  const { t } = useSettings();
  const snapshot = loadedValue(state);
  const { holdings, toggle, set, rename } = useCryptoHoldings();
  // The same cache the Forex tab reads, so this rarely asks NRB itself.
  const { data: forex } = useSWR("forex", () => catchAsFailed(api.getForex(false)));
  const nprRate = nprPerUsd(loadedValue(forex));
  const [query, setQuery] = useState("");
  const [list, setList] = useState<CryptoList>("top");
  const [open, setOpen] = useState<string | null>(linkedCoin ?? null);

  const coins = snapshot?.coins ?? [];
  const listedById = useMemo(() => new Map(coins.map((coin) => [coin.id, coin])), [coins]);

  // Starred coins, asked for by id: those that fell out of the top list
  // would otherwise silently disappear, and every starred one gets its week
  // line this way (the list itself carries none). Plus the coin being opened
  // from search or a link.
  const wanted = useMemo(() => {
    const ids = Object.keys(holdings);
    if (open && !listedById.has(open) && !ids.includes(open)) ids.push(open);
    return ids.sort();
  }, [holdings, listedById, open]);
  const { data: extra } = useSWR(
    snapshot && wanted.length > 0 ? ["crypto-coins", wanted.join(",")] : null,
    () => api.getCryptoCoins(wanted),
  );
  const byId = useMemo(() => {
    const merged = new Map(listedById);
    for (const coin of loadedValue(extra) ?? []) {
      const listedCoin = merged.get(coin.id);
      // The list's figures are the ones everything else is drawn from; only
      // the week line comes from the by-id answer.
      merged.set(coin.id, listedCoin ? { ...listedCoin, sparkline: coin.sparkline } : coin);
    }
    return merged;
  }, [listedById, extra]);

  // Coins starred before the switch to CoinPaprika carry CoinGecko's ids
  // (`bitcoin`); the shell finds their new ones (`btc-bitcoin`) once.
  const renamed = useRef(false);
  useEffect(() => {
    if (!snapshot || renamed.current) return;
    const stale = Object.keys(holdings).filter((id) => !listedById.has(id));
    if (stale.length === 0) return;
    renamed.current = true;
    api
      .cryptoCurrentIds(stale)
      .then((map) => {
        if (Object.keys(map).length > 0) rename(map);
      })
      .catch(() => {});
  }, [snapshot, holdings, listedById, rename]);

  const listed = useMemo(() => listCoins(coins, list), [coins, list]);
  const matches = useMemo(() => (query.trim() ? searchCoins(coins, query) : []), [coins, query]);

  // Searching every coin waits for a pause in typing, so each keystroke
  // doesn't become a request.
  const typed = useDebounced(query.trim(), 350);
  const { data: found, isLoading: searching } = useSWR(
    typed.length >= 2 ? ["crypto-search", typed.toLowerCase()] : null,
    () => api.searchCrypto(typed),
  );
  const more = useMemo(() => {
    const shown = new Set(matches.map((coin) => coin.id));
    return (loadedValue(found) ?? []).filter((hit) => !shown.has(hit.id));
  }, [found, matches]);

  const openCoin = open ? byId.get(open) : undefined;
  if (open && !openCoin && wanted.includes(open)) {
    // A coin from outside the list, still on its way.
    const failed = extra?.status === "failed" || (extra && !loadedValue(extra)?.length);
    return (
      <section className="surface-card space-y-2 p-3">
        <button
          type="button"
          onClick={() => setOpen(null)}
          className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-text"
        >
          <Icon name="chevronLeft" className="size-3" />
          {t("crypto.back")}
        </button>
        <p className="text-[12px] text-text-secondary">
          {failed ? t("crypto.coin-unavailable") : t("state.loading")}
        </p>
      </section>
    );
  }
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
                {matches.map((coin) => row(coin))}
                {/* Beyond the loaded list: every coin CoinPaprika knows. */}
                {more.length > 0 && (
                  <>
                    <p className="px-1.5 pt-2 pb-1 text-[10px] font-semibold text-text-muted">
                      {t("crypto.more-coins")}
                    </p>
                    {more.map((hit) => (
                      <SearchHitRow key={hit.id} hit={hit} onOpen={() => setOpen(hit.id)} />
                    ))}
                  </>
                )}
                {matches.length === 0 && more.length === 0 && (
                  <p className="px-1.5 py-1 text-[11px] text-text-secondary">
                    {searching || typed !== query.trim()
                      ? t("crypto.searching")
                      : t("crypto.no-match")}
                  </p>
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

            <div className="space-y-0.5">
              <p className="flex items-start gap-1.5 px-0.5 text-[10px] leading-snug text-text-muted">
                <Icon name="info" className="mt-px size-3 shrink-0" />
                <span>{t("crypto.note")}</span>
              </p>
              <p className="px-0.5 text-[10px] text-text-muted">
                {t("crypto.updated")} {sourceStamp(snapshot.freshness)} ·{" "}
                <button
                  type="button"
                  onClick={() =>
                    openExternalLink(SOURCE_LINKS[snapshot.source] ?? COINPAPRIKA_LINK)
                  }
                  className="text-[color:var(--color-accent-mark)] hover:underline"
                >
                  {snapshot.source}
                </button>
              </p>
            </div>
          </div>
        )}
      </StateBanner>
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

  // Nothing starred yet: no card. Starring a coin is how it appears.
  if (coins.length === 0) return null;

  return (
    <section className="surface-card p-2.5" aria-label={t("crypto.yours")}>
      <p className="text-[11px] font-semibold text-text-secondary">{t("crypto.yours")}</p>

      {held.length > 0 && (
        <div className="mt-1 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[18px] font-semibold leading-tight tabular-nums">{usd(total)}</p>
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
    </section>
  );
}

/** `value`, once it has stopped changing for `delay` milliseconds. */
function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return settled;
}
