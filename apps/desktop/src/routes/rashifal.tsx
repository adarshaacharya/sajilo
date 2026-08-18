import { useCallback, useEffect, useState } from "react";
import { Card } from "../components/Card";
import { type LoadStatus, StateBanner } from "../components/StateBanner";
import { api } from "../lib/ipc";
import { useSettings } from "../lib/settings";
import type { LoadState } from "../types/api/LoadState";
import type { RashifalSnapshot } from "../types/api/RashifalSnapshot";
import type { RashiSign } from "../types/api/RashiSign";

/**
 * The twelve signs in canonical order — Nepali, romanised, Western, and the
 * नामाक्षर used to pick a rashi from a name.
 */
const SIGNS: readonly {
  id: RashiSign;
  en: string;
  ne: string;
  western: string;
  syllables: readonly string[];
}[] = [
  {
    id: "mesh",
    en: "Mesh",
    ne: "मेष",
    western: "Aries",
    syllables: ["चु", "चे", "चो", "ला", "लि", "लु", "ले", "लो", "अ"],
  },
  {
    id: "vrish",
    en: "Vrish",
    ne: "वृष",
    western: "Taurus",
    syllables: ["इ", "उ", "ए", "ओ", "वा", "वि", "वु", "वे", "वो"],
  },
  {
    id: "mithun",
    en: "Mithun",
    ne: "मिथुन",
    western: "Gemini",
    syllables: ["का", "कि", "कु", "घ", "ङ", "छ", "के", "को", "हा"],
  },
  {
    id: "karkat",
    en: "Karkat",
    ne: "कर्कट",
    western: "Cancer",
    syllables: ["हि", "हु", "हे", "हो", "डा", "डि", "डु", "डे", "डो"],
  },
  {
    id: "simha",
    en: "Simha",
    ne: "सिंह",
    western: "Leo",
    syllables: ["मा", "मि", "मु", "मे", "मो", "टा", "टि", "टु", "टे"],
  },
  {
    id: "kanya",
    en: "Kanya",
    ne: "कन्या",
    western: "Virgo",
    syllables: ["टो", "पा", "पि", "पु", "ष", "ण", "ठ", "पे", "पो"],
  },
  {
    id: "tula",
    en: "Tula",
    ne: "तुला",
    western: "Libra",
    syllables: ["रा", "रि", "रु", "रे", "रो", "ता", "ति", "तु", "ते"],
  },
  {
    id: "vrishchik",
    en: "Vrishchik",
    ne: "वृश्चिक",
    western: "Scorpio",
    syllables: ["तो", "ना", "नि", "नु", "ने", "नो", "या", "यि", "यु"],
  },
  {
    id: "dhanu",
    en: "Dhanu",
    ne: "धनु",
    western: "Sagittarius",
    syllables: ["ये", "यो", "भा", "भि", "भु", "धा", "फा", "ढा", "भे"],
  },
  {
    id: "makar",
    en: "Makar",
    ne: "मकर",
    western: "Capricorn",
    syllables: ["भो", "जा", "जि", "जु", "जे", "जो", "ख", "खि", "खु", "खे", "खो", "गा", "गि"],
  },
  {
    id: "kumbha",
    en: "Kumbha",
    ne: "कुम्भ",
    western: "Aquarius",
    syllables: ["गु", "गे", "गो", "सा", "सि", "सु", "से", "सो", "दा"],
  },
  {
    id: "meen",
    en: "Meen",
    ne: "मीन",
    western: "Pisces",
    syllables: ["दि", "दु", "थ", "झ", "ञ", "दे", "दो", "चा", "चि"],
  },
];

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

function signMeta(id: RashiSign) {
  return SIGNS.find((entry) => entry.id === id)!;
}

export function Rashifal() {
  const { t } = useSettings();
  const [state, setState] = useState<LoadState<RashifalSnapshot>>();
  const [mine, setMine] = useState<RashiSign | null>(storedSign);
  /** Browse another sign without changing the saved one. */
  const [viewing, setViewing] = useState<RashiSign | null>(null);
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
    setMine(id);
    setViewing(null);
    setPicking(false);
  };

  const snapshot = state?.status === "fresh" || state?.status === "stale" ? state.value : undefined;
  const shown = viewing ?? mine;
  const shownMeta = shown ? signMeta(shown) : null;
  const reading = shown
    ? snapshot?.readings.find((entry) => entry.sign === shown)
    : undefined;
  const isMine = shown !== null && shown === mine;

  if (!mine || picking) {
    return (
      <div className="space-y-3">
        <Card>
          <h2 className="text-[13px] font-semibold">{t("rashifal.pick-sign")}</h2>
          <p className="mt-0.5 mb-2.5 text-[11px] leading-snug text-text-secondary">
            {t("rashifal.pick-hint")}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {SIGNS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => choose(entry.id)}
                className={`rounded-xl border border-border bg-surface px-2 py-2 text-left transition-colors hover:bg-surface-hover ${
                  entry.id === mine ? "ring-1 ring-[color:var(--color-accent-mark)]/50" : ""
                }`}
              >
                <span className="block text-[13px] font-semibold leading-tight">{entry.ne}</span>
                <span className="mt-0.5 block truncate text-[10px] text-text-muted">
                  {entry.syllables.slice(0, 5).join(" ")}
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <Card>
        <StateBanner state={banner(state)} onRetry={() => load(true)}>
          {shownMeta && (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[20px] font-semibold leading-none">{shownMeta.ne}</p>
                  <p className="mt-1 text-[11px] text-text-muted">
                    {shownMeta.en} · {shownMeta.western}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (isMine) {
                      setPicking(true);
                    } else {
                      setViewing(null);
                    }
                  }}
                  className="shrink-0 pt-0.5 text-[11px] font-medium text-[color:var(--color-accent-mark)] hover:opacity-80"
                >
                  {isMine ? t("rashifal.change-sign") : t("rashifal.back-to-mine")}
                </button>
              </div>

              <p className="text-[11px] leading-relaxed text-text-secondary">
                {shownMeta.syllables.join("  ·  ")}
              </p>

              <div className="border-t border-border" />

              {reading ? (
                <p className="text-[13px] leading-[1.55] whitespace-pre-line">{reading.prediction}</p>
              ) : (
                snapshot && <p className="text-[12px] text-text-secondary">{t("rashifal.stale")}</p>
              )}
            </div>
          )}
        </StateBanner>
      </Card>

      <Card>
        <p className="mb-1.5 text-[11px] font-medium text-text-secondary">{t("rashifal.all-signs")}</p>
        <div className="grid grid-cols-4 gap-1">
          {SIGNS.map((entry) => {
            const selected = entry.id === shown;
            const owned = entry.id === mine;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setViewing(entry.id === mine ? null : entry.id)}
                className={`rounded-xl px-1 py-1.5 text-[11px] font-medium transition-colors ${
                  selected
                    ? "bg-accent/15 text-[color:var(--color-accent-mark)]"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text"
                } ${owned && !selected ? "ring-1 ring-[color:var(--color-accent-mark)]/40" : ""}`}
              >
                {entry.ne}
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
