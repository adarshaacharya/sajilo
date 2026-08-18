import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { CONTROL } from "../../shared/components/control";
import { useHeaderSlot } from "../../shared/components/header-slot";
import { Icon } from "../../shared/components/icon";
import { Select } from "../../shared/components/select";
import { StateBanner } from "../../shared/components/state-banner";
import { useSettings } from "../../shared/context/settings-context";
import { api } from "../../shared/lib/ipc";
import {
  catchAsFailed,
  fetchedAtLabel,
  loadBanner,
  loadedValue,
} from "../../shared/lib/load-state";
import type { ForexSnapshot } from "../../types/api/ForexSnapshot";
import { ForexRateRow } from "./_components/forex-rate-row";
import { conversionText, rateFootnote, sourceTimestamp } from "./_lib/format";

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
    data: state,
    isValidating,
    mutate,
  } = useSWR("forex", () => catchAsFailed(api.getForex(false)));
  const load = useCallback(
    (refresh = false) =>
      mutate(catchAsFailed<ForexSnapshot>(api.getForex(refresh)), { revalidate: false }),
    [mutate],
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
