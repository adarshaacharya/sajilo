import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Icon } from "../../../shared/components/icon";
import { SearchField } from "../../../shared/components/search-field";
import { Segmented } from "../../../shared/components/segmented";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { spring, useMotionEnabled } from "../../../shared/lib/motion";
import { digits } from "../../../shared/lib/numerals";
import { districtName, placeName, searchPlaces, usePlaces } from "../../../shared/lib/places";
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

/** How many matches the inline place search lists. */
const PLACE_RESULTS = 6;

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
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="setup-title" className="text-[12px] font-semibold">
          {t("setup.title")}
        </h2>
        <span className="text-[10px] text-text-muted">{t("setup.body")}</span>
      </div>

      <p className="setup-preview" aria-live="polite">
        {parts.map((part, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the date's parts keep their order
          <FlipWord key={index} text={part} />
        ))}
      </p>

      <div className="grid grid-cols-2 gap-2">
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
      </div>

      <PlaceRow
        done={
          <button type="button" onClick={onDone} className="settings-btn shrink-0">
            {t("setup.done")}
          </button>
        }
      />
    </section>
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

/** The weather place as one slim row; tapping it searches every town in
 * place, rather than scrolling a list of seventy-seven. */
function PlaceRow({ done }: { done: ReactNode }) {
  const { t, language, modules, setModules } = useSettings();
  const places = usePlaces();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = places.find((place) => place.id === modules.weatherLocation);
  const results = useMemo(
    () => (query.trim() ? searchPlaces(places, query).slice(0, PLACE_RESULTS) : []),
    [places, query],
  );

  if (places.length === 0) return <div className="flex justify-end">{done}</div>;

  const pick = (id: string) => {
    setModules((prefs) => ({
      ...prefs,
      weatherLocation: id,
      weatherPins: [id, ...prefs.weatherPins.filter((pin) => pin !== id)],
    }));
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="space-y-1.5">
      {/* Done shares the place's line: the card's last row, not a row of its own. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((shown) => !shown)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px]"
        >
          <span className="shrink-0 text-text-secondary">{t("setup.place")}</span>
          <span className="truncate font-semibold">
            {current ? placeName(current, language) : ""}
          </span>
          <Icon
            name="chevronDown"
            className={`size-3 shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {done}
      </div>
      {open && (
        <div className="space-y-0.5">
          <SearchField value={query} onChange={setQuery} placeholder={t("weather.search-places")} />
          {results.map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => pick(place.id)}
              className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-hover"
            >
              <span className="text-[12px] font-medium">{placeName(place, language)}</span>
              <span className="truncate text-[10px] text-text-muted">
                {districtName(place, language)}
              </span>
            </button>
          ))}
          {query.trim() && results.length === 0 && (
            <p className="px-2 py-1 text-[11px] text-text-muted">{t("weather.no-place")}</p>
          )}
        </div>
      )}
    </div>
  );
}
