import { useCallback, useEffect, useState } from "react";
import { Card } from "../components/Card";
import { type LoadStatus, StateBanner } from "../components/StateBanner";
import { api } from "../lib/ipc";
import { useSettings } from "../lib/settings";
import type { LoadState } from "../types/api/LoadState";
import type { RashifalSnapshot } from "../types/api/RashifalSnapshot";
import type { RashiSign } from "../types/api/RashiSign";

/**
 * The twelve signs in canonical order, with the names a reader recognises.
 *
 * Romanised Nepali rather than the Western equivalent, matching
 * `RashiSign::display_name` — someone who knows they are Mesh does not
 * necessarily think of themselves as Aries.
 */
const SIGNS: readonly { id: RashiSign; en: string; ne: string }[] = [
  { id: "mesh", en: "Mesh", ne: "मेष" },
  { id: "vrish", en: "Vrish", ne: "वृष" },
  { id: "mithun", en: "Mithun", ne: "मिथुन" },
  { id: "karkat", en: "Karkat", ne: "कर्कट" },
  { id: "simha", en: "Simha", ne: "सिंह" },
  { id: "kanya", en: "Kanya", ne: "कन्या" },
  { id: "tula", en: "Tula", ne: "तुला" },
  { id: "vrishchik", en: "Vrishchik", ne: "वृश्चिक" },
  { id: "dhanu", en: "Dhanu", ne: "धनु" },
  { id: "makar", en: "Makar", ne: "मकर" },
  { id: "kumbha", en: "Kumbha", ne: "कुम्भ" },
  { id: "meen", en: "Meen", ne: "मीन" },
];

/**
 * The chosen sign, remembered across launches.
 *
 * A rashi is the moon sign from a birth chart, or the one assigned from the
 * first syllable of a name — never derived from a birth date. So it is asked
 * for once and kept, rather than computed.
 */
const STORAGE_KEY = "sajilo.rashi";

function storedSign(): RashiSign | null {
  const saved = localStorage.getItem(STORAGE_KEY);
  return SIGNS.some((sign) => sign.id === saved) ? (saved as RashiSign) : null;
}

function banner(state: LoadState<RashifalSnapshot> | undefined): LoadStatus {
  if (!state) return { status: "loading" };
  switch (state.status) {
    case "stale":
      return { status: "stale" };
    case "failed":
      return { status: "failed", message: state.value };
    default:
      return { status: state.status };
  }
}

export function Rashifal() {
  const { t, language } = useSettings();
  const [state, setState] = useState<LoadState<RashifalSnapshot>>();
  const [sign, setSign] = useState<RashiSign | null>(storedSign);
  const [picking, setPicking] = useState(false);

  const load = useCallback((refresh = false) => {
    setState(undefined);
    api
      .getRashifal(refresh)
      .then(setState)
      .catch((error: unknown) => setState({ status: "failed", value: String(error) }));
  }, []);

  useEffect(() => load(), [load]);

  const choose = (id: RashiSign) => {
    localStorage.setItem(STORAGE_KEY, id);
    setSign(id);
    setPicking(false);
  };

  const snapshot = state?.status === "fresh" || state?.status === "stale" ? state.value : undefined;
  const name = (id: RashiSign) => {
    const found = SIGNS.find((entry) => entry.id === id);
    return language === "ne" ? found?.ne : found?.en;
  };

  // Nothing chosen yet, or the reader is changing it: the picker is the screen.
  if (!sign || picking) {
    return (
      <div className="space-y-3">
        <Card title={t("rashifal.pick-sign")}>
          <p className="mb-2 text-[11px] text-text-muted">{t("rashifal.pick-hint")}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {SIGNS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => choose(entry.id)}
                className={`rounded-md border px-1 py-2 transition-colors ${
                  entry.id === sign
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-text-secondary hover:bg-surface-hover hover:text-text"
                }`}
              >
                <span className="block text-[13px] font-np">{entry.ne}</span>
                <span className="block text-[10px] text-text-muted">{entry.en}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  const mine = snapshot?.readings.find((reading) => reading.sign === sign);
  const others = snapshot?.readings.filter((reading) => reading.sign !== sign) ?? [];

  return (
    <div className="space-y-3">
      <Card title={name(sign)}>
        <StateBanner state={banner(state)} onRetry={() => load(true)}>
          {mine ? (
            <p className="whitespace-pre-line leading-relaxed">{mine.prediction}</p>
          ) : (
            snapshot && <p className="text-text-secondary">{t("rashifal.stale")}</p>
          )}
        </StateBanner>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="mt-2 rounded-md border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-hover hover:text-text"
        >
          {t("rashifal.change-sign")}
        </button>
      </Card>

      {others.length > 0 && (
        <Card title={t("rashifal.all-signs")}>
          <ul className="space-y-2">
            {others.map((reading) => (
              <li key={reading.sign}>
                <p className="text-[11px] font-medium text-text-muted">{name(reading.sign)}</p>
                <p className="leading-relaxed">{reading.prediction}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
