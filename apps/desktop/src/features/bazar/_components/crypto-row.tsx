import { useState } from "react";
import { Sparkline } from "../../../shared/components/sparkline";
import type { CryptoCoin } from "../../../types/api/CryptoCoin";
import { usd } from "../_lib/crypto";
import { ChangeBadge } from "./change-badge";
import { FollowButton } from "./follow-button";

/**
 * A coin's own round mark, on a white disc: most logos fill the circle and
 * hide it, while the few drawn in black on transparent (Ethena, Ondo) would
 * otherwise vanish into the dark card. Offline, or from the Kraken fallback, which
 * sends none, the ticker's first letter stands in at the same size.
 */
export function CoinLogo({
  url,
  symbol,
  size = 26,
}: {
  url: string | null;
  symbol: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="shrink-0 rounded-full bg-white object-contain"
        style={box}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-surface-hover text-[11px] font-semibold text-text-secondary"
      style={box}
    >
      {symbol.charAt(0)}
    </span>
  );
}

/** The day's move as a percent badge; blank where the source gave none. */
export function DayChange({ coin }: { coin: CryptoCoin }) {
  if (coin.change24h == null) return null;
  // A move that rounds to nothing reads 0.00%, not -0.00%.
  const change = Math.abs(coin.change24h) < 0.005 ? 0 : coin.change24h;
  return <ChangeBadge change={change} previous={100} percent={change} percentOnly />;
}

/**
 * One coin in a list: rank and mark, name and ticker, its week as a line, and
 * the price with the day's move. `detail` replaces the ticker line, e.g. with
 * what the user holds.
 */
export function CryptoRow({
  coin,
  followed,
  detail,
  onOpen,
  onToggle,
}: {
  coin: CryptoCoin;
  followed: boolean;
  detail?: string;
  onOpen: () => void;
  onToggle: () => void;
}) {
  // The week's line is green or red by where it ended against where it began.
  const week = coin.sparkline;
  const rising = week.length > 1 && (week.at(-1) ?? 0) >= (week[0] ?? 0);
  return (
    <div className="row-line flex items-center gap-1 rounded-md py-1 transition-colors hover:bg-surface-hover focus-within:bg-surface-hover">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left"
      >
        <CoinLogo url={coin.imageUrl} symbol={coin.symbol} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{coin.name}</span>
          <span className="block truncate text-[10px] text-text-muted tabular-nums">
            {detail ?? (coin.rank != null ? `#${coin.rank} · ${coin.symbol}` : coin.symbol)}
          </span>
        </span>
        {week.length > 1 && (
          <span className="w-12 shrink-0" aria-hidden>
            <Sparkline
              values={week}
              className={rising ? "text-positive/80" : "text-holiday/80"}
              label={coin.name}
            />
          </span>
        )}
        <span className="flex w-[84px] shrink-0 flex-col items-end gap-0.5">
          <span className="text-[13px] font-medium tabular-nums">{usd(coin.price)}</span>
          <DayChange coin={coin} />
        </span>
      </button>
      <FollowButton followed={followed} onToggle={onToggle} />
    </div>
  );
}
