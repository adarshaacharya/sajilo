import { useState } from "react";

/**
 * The fund manager's logo, on a white plate so the many dark-on-transparent
 * bank marks stay visible on the dark card. Where there is no logo, or it
 * fails to load (offline, or the ShareSansar fallback, which sends none), the
 * fund's first letter stands in at the same size so rows keep their alignment.
 */
export function FundLogo({
  url,
  symbol,
  size = 28,
}: {
  url: string | null;
  symbol: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };

  if (url && !failed) {
    return (
      <span
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-0.5"
        style={box}
      >
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-contain"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-md bg-surface-hover text-[11px] font-semibold text-text-secondary"
      style={box}
    >
      {symbol.charAt(0)}
    </span>
  );
}
