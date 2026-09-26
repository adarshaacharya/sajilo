import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Segmented } from "../../../shared/components/segmented";
import { Select } from "../../../shared/components/select";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { spring, useMotionEnabled } from "../../../shared/lib/motion";
import { digits } from "../../../shared/lib/numerals";
import { placeName, usePlaces } from "../../../shared/lib/places";
import { track } from "../../../shared/lib/usage";
import { WEEKDAYS_NE_LONG } from "./date-summary-panel";

/** Set by the shell on a brand-new install only, so people who already use
 * Sajilo never see this; cleared by Done. */
const PENDING_KEY = "setupCardPending";

/** Dev builds: show welcome card on Today until you set this to false. */
const DEV_ALWAYS_SHOW_SETUP = import.meta.env.DEV;

export const SETUP_PREVIEW_SESSION_KEY = "sajilo-preview-setup";
export const SETUP_PREVIEW_EVENT = "sajilo-preview-setup";

/** Opens the first-run setup on Today without touching install prefs. Dev builds only. */
export function triggerSetupPreview() {
  if (!import.meta.env.DEV) return;
  sessionStorage.setItem(SETUP_PREVIEW_SESSION_KEY, "1");
  window.dispatchEvent(new Event(SETUP_PREVIEW_EVENT));
}

/** Whether the one-time setup card is due, and the way to put it away. */
export function useSetupCard() {
  const [visible, setVisible] = useState(() => import.meta.env.DEV && DEV_ALWAYS_SHOW_SETUP);
  const previewRef = useRef(import.meta.env.DEV && DEV_ALWAYS_SHOW_SETUP);

  useEffect(() => {
    let cancelled = false;
    const show = () => {
      if (cancelled) return;
      previewRef.current = true;
      setVisible(true);
    };

    const onPreview = () => show();
    const sessionPreview =
      import.meta.env.DEV && sessionStorage.getItem(SETUP_PREVIEW_SESSION_KEY) === "1";

    if (sessionPreview) {
      show();
    } else if (!DEV_ALWAYS_SHOW_SETUP) {
      api
        .getSetting<boolean>(PENDING_KEY)
        .then((pending) => {
          if (!cancelled) setVisible(pending === true);
        })
        .catch(() => {});
    }

    if (import.meta.env.DEV) {
      window.addEventListener(SETUP_PREVIEW_EVENT, onPreview);
    }

    return () => {
      cancelled = true;
      if (import.meta.env.DEV) {
        window.removeEventListener(SETUP_PREVIEW_EVENT, onPreview);
      }
    };
  }, []);

  const dismiss = () => {
    track("action.setup-done");
    setVisible(false);
    if (previewRef.current || (import.meta.env.DEV && DEV_ALWAYS_SHOW_SETUP)) {
      previewRef.current = false;
      sessionStorage.removeItem(SETUP_PREVIEW_SESSION_KEY);
      return;
    }
    void api.deleteSetting(PENDING_KEY).catch(() => {});
  };

  return { visible, dismiss };
}

/** Short in English so the preview stays on one line in both languages. */
const WEEKDAYS_EN_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The first-run card, kept quiet: one line of text, today's date large, and
 * the choices that change it. Flipping language or digits flips only the
 * parts of the date that change, so the choice is seen rather than read.
 * Each saves the moment it is picked; Done only puts the card away.
 */
export function SetupCard({ onDone }: { onDone: () => void }) {
  const { t, language, numerals, setLanguage, setNumerals } = useSettings();
  const { data: today } = useSWR("setup:today", () => api.today());

  // The engine's date, only spelled out here.
  const parts = today
    ? [
        language === "ne"
          ? `${WEEKDAYS_NE_LONG[today.weekday]},`
          : `${WEEKDAYS_EN_SHORT[today.weekday]},`,
        digits(today.nepali.day, numerals),
        language === "ne" ? today.nepaliMonthName : today.englishMonthName,
        digits(today.nepali.year, numerals),
      ]
    : [];

  return (
    <section className="surface-card space-y-3 p-3" aria-labelledby="setup-title">
      <div>
        <h2 id="setup-title" className="text-[13px] font-semibold">
          {t("setup.title")}
        </h2>
        <p className="mt-0.5 text-[10px] text-text-muted">{t("setup.body")}</p>
      </div>

      <p className="setup-preview" aria-live="polite">
        {parts.map((part, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the date's parts keep their order
          <FlipWord key={index} text={part} />
        ))}
      </p>

      {/* Each choice says what it is: "1 2 3" alone does not. */}
      <div className="grid grid-cols-2 gap-2">
        <SetupField label={t("setup.language")}>
          <Segmented
            label={t("setup.language")}
            size="sm"
            value={language}
            onChange={setLanguage}
            options={[
              { id: "en", label: "English" },
              { id: "ne", label: "नेपाली" },
            ]}
          />
        </SetupField>
        <SetupField label={t("setup.digits")}>
          <Segmented
            label={t("setup.digits")}
            size="sm"
            value={numerals}
            onChange={setNumerals}
            options={[
              { id: "latin", label: "1 2 3" },
              { id: "devanagari", label: "१ २ ३" },
            ]}
          />
        </SetupField>
      </div>

      <PlaceRow />

      {/* The one way out, full width and in the accent: the card is done
          when this is pressed, and it should look like the end. */}
      <button
        type="button"
        onClick={onDone}
        className="settings-btn settings-btn--accent w-full justify-center py-1.5 text-[12px]"
      >
        {t("setup.done")}
      </button>
    </section>
  );
}

/** A small label over one of the card's choices. */
function SetupField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[10px] font-medium text-text-muted">{label}</p>
      {children}
    </div>
  );
}

/** One word of the preview date. When it changes it rolls, old out the top
 * and new in from below, like a flip clock; unchanged words sit still. */
function FlipWord({ text }: { text: string }) {
  const animate = useMotionEnabled();
  if (!animate) return <span className="setup-preview__word">{text}</span>;
  return (
    <span className="setup-preview__word">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          className="inline-block"
          initial={{ y: "70%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-70%", opacity: 0 }}
          transition={spring.tab}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** The weather place as a plain dropdown of every town, alphabetical: one
 * click opens it, and typing a letter jumps there, as any dropdown does. */
function PlaceRow() {
  const { t, language, modules, setModules } = useSettings();
  const places = usePlaces();
  const options = useMemo(
    () =>
      places
        .map((place) => ({ id: place.id, label: placeName(place, language) }))
        .sort((a, b) => a.label.localeCompare(b.label, language === "ne" ? "ne" : "en")),
    [places, language],
  );

  if (places.length === 0) return null;

  return (
    <SetupField label={t("setup.place")}>
      <Select
        ariaLabel={t("setup.place")}
        value={modules.weatherLocation}
        onChange={(id) =>
          setModules((prefs) => ({
            ...prefs,
            weatherLocation: id,
            weatherPins: [id, ...prefs.weatherPins.filter((pin) => pin !== id)],
          }))
        }
        options={options}
      />
    </SetupField>
  );
}
