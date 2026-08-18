import { useEffect, useMemo, useState } from "react";
import { CONTROL } from "../components/control";
import { ForexRateRow } from "../components/forex/ForexRateRow";
import { useHeaderSlot } from "../components/HeaderSlot";
import { Icon } from "../components/Icon";
import { Select } from "../components/Select";
import { StateBanner } from "../components/StateBanner";
import { conversionText, rateFootnote, sourceTimestamp } from "../lib/forex";
import { api } from "../lib/ipc";
import { fetchedAtLabel, loadBanner, loadedValue } from "../lib/loadState";
import { useSettings } from "../lib/settings";
import { useCachedQuery } from "../lib/useCachedQuery";
import type { ForexSnapshot } from "../types/api/ForexSnapshot";
import type { LoadState } from "../types/api/LoadState";

async function openNrb() {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl("https://www.nrb.org.np/");
  } catch {
    window.open("https://www.nrb.org.np/", "_blank", "noopener,noreferrer");
  }
}

export function Forex() {
  const { t, modules } = useSettings();
  const {
    value: state,
    isValidating,
    reload: load,
  } = useCachedQuery("forex", (refresh) =>
    api
      .getForex(refresh)
      .catch(
        (error: unknown): LoadState<ForexSnapshot> => ({ status: "failed", value: String(error) }),
      ),
  );
  const [amount, setAmount] = useState(1);
  const [code, setCode] = useState("USD");
  const [reversed, setReversed] = useState(false);

  const loading = isValidating;

  useEffect(() => {
    if (modules.forexFavourites[0]) setCode(modules.forexFavourites[0]);
  }, [modules.forexFavourites]);

  const snapshot = loadedValue(state);
  const banner = loadBanner(state, fetchedAtLabel(snapshot?.freshness));
  const selected = snapshot?.rates.find((rate) => rate.currencyCode === code) ?? snapshot?.rates[0];
  const favourites =
    snapshot?.rates.filter((rate) => modules.forexFavourites.includes(rate.currencyCode)) ?? [];
  const others =
    snapshot?.rates.filter((rate) => !modules.forexFavourites.includes(rate.currencyCode)) ?? [];

  const refreshButton = useMemo(
    () => (
      <button
        type="button"
        onClick={() => load(true)}
        disabled={loading}
        aria-label={t("action.refresh")}
        className="icon-btn shrink-0"
      >
        <Icon name="refresh" className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
      </button>
    ),
    [load, loading, t],
  );

  useHeaderSlot(refreshButton);

  const conversion =
    selected && Number.isFinite(amount) ? conversionText(selected, amount, reversed) : null;

  return (
    <div className="space-y-2.5">
      <section className="surface-card forex-converter p-2.5">
        <StateBanner state={banner} onRetry={() => load(true)}>
          {snapshot && selected ? (
            <div className="relative z-[1] space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={Number.isFinite(amount) ? amount : ""}
                  min={0}
                  step="any"
                  aria-label="Amount"
                  onChange={(event) => setAmount(Number(event.target.value))}
                  className={`${CONTROL} w-24 shrink-0`}
                />
                <div className="w-20 shrink-0">
                  <Select
                    value={selected.currencyCode}
                    onChange={setCode}
                    options={snapshot.rates.map((rate) => ({
                      id: rate.currencyCode,
                      label: rate.currencyCode,
                    }))}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setReversed((value) => !value)}
                  className="icon-btn shrink-0"
                  aria-label={t("action.swap")}
                >
                  <Icon name="swap" className="size-3.5" />
                </button>
              </div>

              {conversion && (
                <p className="text-[18px] font-semibold leading-snug tracking-tight">
                  {conversion}
                </p>
              )}
              <p className="text-[11px] text-text-muted">{rateFootnote(selected, reversed)}</p>
            </div>
          ) : null}
        </StateBanner>
      </section>

      {favourites.length > 0 && (
        <section className="surface-card p-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            {t("forex.favourites")}
          </p>
          {favourites.map((rate) => (
            <ForexRateRow key={rate.currencyCode} rate={rate} />
          ))}
        </section>
      )}

      {others.length > 0 && (
        <section className="surface-card p-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            {t("forex.all-currencies")}
          </p>
          {others.map((rate) => (
            <ForexRateRow key={rate.currencyCode} rate={rate} />
          ))}
        </section>
      )}

      {snapshot && (
        <div className="px-0.5 text-[10px] text-text-muted">
          <p>
            Published{" "}
            {sourceTimestamp(snapshot).toLocaleString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <button
            type="button"
            onClick={openNrb}
            className="mt-0.5 text-[color:var(--color-forex-tint)] hover:underline"
          >
            Nepal Rastra Bank
          </button>
        </div>
      )}
    </div>
  );
}
