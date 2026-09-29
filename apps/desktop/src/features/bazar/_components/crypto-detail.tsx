import { useEffect, useState } from "react";
import { BackButton } from "../../../shared/components/back-button";
import { CONTROL } from "../../../shared/components/control";
import { useSettings } from "../../../shared/context/settings-context";
import { openExternalLink } from "../../../shared/lib/external-link";
import type { CryptoCoin } from "../../../types/api/CryptoCoin";
import {
  amountCompact,
  type CryptoHolding,
  holdingGain,
  percentText,
  usd,
  usdCompact,
} from "../_lib/crypto";
import { money0 } from "../_lib/format";
import { CryptoChart } from "./crypto-chart";
import { CoinLogo, DayChange } from "./crypto-row";
import { FollowButton } from "./follow-button";

/**
 * A number field that holds what is typed, so "0.0" survives until the next
 * digit; only a parsed number is passed on. It follows the stored value only
 * when that says something else, e.g. once saved holdings finish loading.
 */
function NumberField({
  value,
  label,
  prefix,
  onChange,
}: {
  value: number | null;
  label: string;
  prefix?: string;
  onChange: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value ? String(value) : "");
  useEffect(() => {
    setDraft((current) => ((Number(current) || null) === value ? current : String(value || "")));
  }, [value]);
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1 block text-[10px] text-text-muted">{label}</span>
      <span className="relative block">
        {prefix && (
          <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[12px] text-text-muted">
            {prefix}
          </span>
        )}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={draft}
          placeholder="0"
          onChange={(event) => {
            setDraft(event.target.value);
            const parsed = Number(event.target.value);
            if (Number.isFinite(parsed)) onChange(parsed > 0 ? parsed : null);
          }}
          className={`${CONTROL} w-full tabular-nums ${prefix ? "pl-5" : ""}`}
        />
      </span>
    </label>
  );
}

function Rupees({ dollars, rate }: { dollars: number; rate: number | null }) {
  if (rate == null) return null;
  // Whole rupees for a coin worth rupees; a coin worth paisa keeps enough
  // digits to show something other than "Rs 0".
  const rupees = dollars * rate;
  const size = Math.abs(rupees);
  const text =
    size >= 100 || size === 0
      ? money0.format(rupees)
      : new Intl.NumberFormat("en-IN", {
          maximumFractionDigits: size >= 1 ? 2 : size >= 0.01 ? 4 : 8,
        }).format(rupees);
  return <>≈ Rs {text}</>;
}

export function CryptoDetail({
  coin,
  followed,
  holding,
  nprRate,
  onBack,
  onToggle,
  onHolding,
}: {
  coin: CryptoCoin;
  followed: boolean;
  holding: CryptoHolding;
  /** NPR per US dollar at NRB's rate, when Forex has loaded. */
  nprRate: number | null;
  onBack: () => void;
  onToggle: () => void;
  onHolding: (change: Partial<CryptoHolding>) => void;
}) {
  const { t, language } = useSettings();
  const worth = holding.amount > 0 ? holding.amount * coin.price : null;
  const gain = holdingGain(holding, coin.price);
  const paid = holding.cost != null ? holding.amount * holding.cost : null;

  const range =
    coin.low24h != null && coin.high24h != null
      ? `${usd(coin.low24h)} – ${usd(coin.high24h)}`
      : null;
  // The year matters here: a coin's high can be years behind it.
  const athDate = coin.allTimeHighDate
    ? new Intl.DateTimeFormat(language === "ne" ? "ne-NP-u-nu-latn" : "en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${coin.allTimeHighDate}T00:00:00Z`))
    : null;

  type Fact = { label: string; value: string; tone?: string; note?: string };
  const facts = (
    [
      coin.marketCap != null && {
        label: t("crypto.market-cap"),
        value: usdCompact(coin.marketCap),
      },
      coin.volume24h != null && { label: t("crypto.volume"), value: usdCompact(coin.volume24h) },
      range != null && { label: t("crypto.day-range"), value: range },
      coin.change7d != null && {
        label: t("crypto.week-change"),
        value: percentText(coin.change7d),
        tone: coin.change7d >= 0 ? "text-positive" : "text-holiday",
      },
      coin.circulatingSupply != null && {
        label: t("crypto.supply"),
        value: `${amountCompact(coin.circulatingSupply)} ${coin.symbol}`,
      },
      {
        label: t("crypto.max-supply"),
        value:
          coin.maxSupply != null
            ? `${amountCompact(coin.maxSupply)} ${coin.symbol}`
            : t("crypto.no-limit"),
      },
      coin.allTimeHigh != null && {
        label: t("crypto.ath"),
        value: usd(coin.allTimeHigh),
        note: [coin.fromAllTimeHigh != null ? percentText(coin.fromAllTimeHigh) : null, athDate]
          .filter(Boolean)
          .join(" · "),
      },
    ] as (Fact | false)[]
  ).filter((fact): fact is Fact => Boolean(fact));

  return (
    <div className="space-y-2.5">
      <section className="surface-card p-2.5">
        <div className="flex items-start gap-2">
          <BackButton onClick={onBack} />
          <CoinLogo url={coin.imageUrl} symbol={coin.symbol} size={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold leading-tight">{coin.name}</p>
            <p className="mt-0.5 text-[10px] text-text-muted">
              {coin.rank != null && `#${coin.rank} · `}
              {coin.symbol}
            </p>
          </div>
          <FollowButton followed={followed} onToggle={onToggle} />
        </div>

        <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-[28px] font-semibold leading-none tabular-nums">{usd(coin.price)}</p>
          <DayChange coin={coin} />
        </div>
        {nprRate != null && (
          <p className="mt-1.5 text-[11px] text-text-muted tabular-nums">
            <Rupees dollars={coin.price} rate={nprRate} /> · {t("crypto.npr-rate")}
          </p>
        )}

        <CryptoChart id={coin.id} />

        {facts.length > 0 && (
          <div className="section-divider mt-2.5 grid grid-cols-2 gap-2 pt-2">
            {facts.map((fact) => (
              <div key={fact.label} className="min-w-0">
                <p className="text-[10px] text-text-muted">{fact.label}</p>
                <p className={`truncate text-[11px] font-medium tabular-nums ${fact.tone ?? ""}`}>
                  {fact.value}
                </p>
                {fact.note && (
                  <p className="truncate text-[10px] text-text-muted tabular-nums">{fact.note}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => openExternalLink(`https://coinpaprika.com/coin/${coin.id}/`)}
          className="mt-2 text-[11px] text-[color:var(--color-accent-mark)] hover:opacity-80"
        >
          {t("crypto.open-source")}
        </button>
      </section>

      <section className="surface-card p-2.5">
        <p className="mb-2 text-[11px] font-semibold text-text-secondary">{t("crypto.holding")}</p>
        <div className="flex gap-2">
          <NumberField
            value={holding.amount || null}
            label={t("crypto.amount").replace("{symbol}", coin.symbol)}
            onChange={(amount) => {
              // What you hold belongs with the coins you keep.
              if (!followed) onToggle();
              onHolding({ amount: amount ?? 0 });
            }}
          />
          <NumberField
            value={holding.cost}
            label={t("crypto.cost")}
            prefix="$"
            onChange={(cost) => onHolding({ cost })}
          />
        </div>
        {worth != null && (
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-text-muted">{t("crypto.worth")}</span>
            <span className="text-right">
              <span className="block text-[16px] font-semibold tabular-nums">{usd(worth)}</span>
              {nprRate != null && (
                <span className="block text-[10px] text-text-muted tabular-nums">
                  <Rupees dollars={worth} rate={nprRate} />
                </span>
              )}
            </span>
          </div>
        )}
        {gain != null && paid != null && paid > 0 && (
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-text-muted">
              {t("crypto.paid").replace("{amount}", usd(paid))}
            </span>
            <span
              className={`text-[11px] font-medium tabular-nums ${gain >= 0 ? "text-positive" : "text-holiday"}`}
            >
              {gain >= 0 ? "+" : "−"}
              {usd(Math.abs(gain))} ({percentText((gain / paid) * 100)})
            </span>
          </div>
        )}
        <p className="mt-2 text-[10px] text-text-muted">{t("crypto.on-device")}</p>
      </section>
    </div>
  );
}
