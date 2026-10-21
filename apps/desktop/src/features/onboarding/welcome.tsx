import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import appIcon from "../../../src-tauri/icons/128x128@2x.png";
import { Icon, type IconName } from "../../shared/components/icon";
import { Segmented } from "../../shared/components/segmented";
import { Select } from "../../shared/components/select";
import { Switch } from "../../shared/components/switch";
import { useSettings } from "../../shared/context/settings-context";
import { api, type FocusSettings, type PlanTime } from "../../shared/lib/ipc";
import { LIMITS } from "../../shared/lib/limits";
import { spring, useMotionEnabled } from "../../shared/lib/motion";
import { digits } from "../../shared/lib/numerals";
import { placeName, usePlaces } from "../../shared/lib/places";
import { isLinux, isWindows } from "../../shared/lib/platform";
import { cityFor, flagFor, searchTimezones } from "../../shared/lib/world-clock";
import type { RashiSign } from "../../types/api/RashiSign";
import { WEEKDAYS_NE_LONG } from "../calendar/_components/date-summary-panel";
import { Confetti } from "../games/_components/game-over";
import { SignGrid } from "../rashifal/_components/sign-grid";
import { SIGNS } from "../rashifal/_lib/signs";
import { useSignSearch } from "../rashifal/_lib/use-sign-search";

type TFn = ReturnType<typeof useSettings>["t"];

const STEPS = ["hello", "place", "rashi", "day", "tour", "done"] as const;
type Step = (typeof STEPS)[number];

/** Where Nepalis abroad most often are, for one-tap world clocks. */
const ABROAD = [
  "Asia/Qatar",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kuala_Lumpur",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "America/New_York",
  "America/Toronto",
] as const;

/** What people call a place when its time zone goes by the country. */
const CITY_NAMES: Record<string, string> = { "Asia/Qatar": "Doha" };
const cityName = (timeZone: string) => CITY_NAMES[timeZone] ?? cityFor(timeZone).city;

/** The rashi is saved where the Rashifal tab keeps it. */
const SIGN_KEY = "selectedRashi";

/**
 * The first thing a new install shows: a short, friendly welcome over the
 * whole popover. Six steps, each saving its choice the moment it's made, so
 * Skip (always there) loses nothing already picked. Language and numbers,
 * the weather town and clocks for family abroad, the rashi, the workday and
 * its breaks, a look at what's inside, and where to find Sajilo again.
 */
export function Welcome({ onDone }: { onDone: () => void }) {
  const { t } = useSettings();
  const motionOn = useMotionEnabled();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const step: Step = STEPS[index] ?? "done";
  const last = index === STEPS.length - 1;

  const go = (next: number) => {
    setDirection(next > index ? 1 : -1);
    setIndex(Math.max(0, Math.min(STEPS.length - 1, next)));
  };
  const finish = () => onDone();

  // On the page itself, not inside Today: a moving screen around it would
  // keep it from covering the tab bar.
  return createPortal(
    <div className="welcome" role="dialog" aria-modal="true" aria-label={t("welcome.title")}>
      <div className="welcome__top">
        <div className="welcome__dots" aria-hidden="true">
          {STEPS.map((each, at) => (
            <span
              key={each}
              className={`welcome__dot ${at === index ? "welcome__dot--on" : at < index ? "welcome__dot--done" : ""}`}
            />
          ))}
        </div>
        {!last && (
          <button type="button" onClick={finish} className="welcome__skip">
            {t("welcome.skip")}
          </button>
        )}
      </div>

      <div className="welcome__body">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={motionOn ? { opacity: 0, x: 28 * direction } : false}
            animate={{ opacity: 1, x: 0 }}
            exit={motionOn ? { opacity: 0, x: -28 * direction } : undefined}
            transition={spring.tab}
            className="welcome__step"
          >
            {step === "hello" && <Hello t={t} />}
            {step === "place" && <Place t={t} />}
            {step === "rashi" && <Rashi t={t} />}
            {step === "day" && <Day t={t} />}
            {step === "tour" && <Tour t={t} />}
            {step === "done" && <Done t={t} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="welcome__foot">
        {index > 0 && !last && (
          <button type="button" onClick={() => go(index - 1)} className="welcome__back">
            <Icon name="chevronLeft" className="size-3" />
            {t("welcome.back")}
          </button>
        )}
        <button
          type="button"
          onClick={() => (last ? finish() : go(index + 1))}
          className="settings-btn settings-btn--accent welcome__next"
        >
          {t(index === 0 ? "welcome.begin" : last ? "welcome.start" : "welcome.next")}
          {!last && <Icon name="chevronRight" className="size-3" />}
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** A step's heading: a soft icon tile, a title and one line under it. */
function Heading({
  icon,
  emoji,
  title,
  body,
}: {
  icon?: IconName;
  emoji?: string;
  title: string;
  body: string;
}) {
  return (
    <div className="welcome__heading">
      <span className="welcome__badge" aria-hidden="true">
        {emoji ?? (icon && <Icon name={icon} className="size-6" />)}
      </span>
      <h2 className="welcome__title">{title}</h2>
      <p className="welcome__lead">{body}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[10.5px] font-medium text-text-muted">{label}</p>
      {children}
    </div>
  );
}

/** Short in English so the preview stays on one line in both languages. */
const WEEKDAYS_EN_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Namaste, the app's icon, and language and numbers with today's date
 * flipping to match each choice. */
function Hello({ t }: { t: TFn }) {
  const { language, numerals, setLanguage, setNumerals } = useSettings();
  const { data: today } = useSWR("setup:today", () => api.today());
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
    <div className="space-y-4">
      <div className="welcome__heading">
        <img src={appIcon} alt="" className="welcome__app-icon" />
        <h2 className="welcome__title welcome__title--big">{t("welcome.hello.title")}</h2>
        <p className="welcome__lead">
          {t(isWindows || isLinux ? "welcome.hello.body-tray" : "welcome.hello.body-menu")}
        </p>
      </div>

      <p className="setup-preview welcome__date" aria-live="polite">
        {parts.map((part, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the date's parts keep their order
          <FlipWord key={index} text={part} />
        ))}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Field label={t("setup.language")}>
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
        </Field>
        <Field label={t("setup.digits")}>
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
        </Field>
      </div>
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

/** The weather town, and clocks for family or work abroad: the usual places
 * one tap each, any other city by search. */
function Place({ t }: { t: TFn }) {
  const { language, modules, setModules } = useSettings();
  const places = usePlaces();
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchTimezones(query).slice(0, 5), [query]);
  const options = useMemo(
    () =>
      places
        .map((place) => ({ id: place.id, label: placeName(place, language) }))
        .sort((a, b) => a.label.localeCompare(b.label, language === "ne" ? "ne" : "en")),
    [places, language],
  );
  const toggle = (timeZone: string) =>
    setModules((current) => {
      const adding = !current.clocks.includes(timeZone);
      return {
        ...current,
        clocksEnabled: adding || current.clocksEnabled,
        clocks: adding
          ? [...current.clocks, timeZone]
          : current.clocks.filter((tz) => tz !== timeZone),
      };
    });
  const extra = modules.clocks.filter((tz) => !(ABROAD as readonly string[]).includes(tz));

  return (
    <div className="space-y-3.5">
      <Heading icon="weather" title={t("welcome.place.title")} body={t("welcome.place.body")} />
      {options.length > 0 && (
        <Field label={t("setup.place")}>
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
        </Field>
      )}

      <div className="space-y-1.5">
        <p className="text-[12px] font-semibold">{t("welcome.place.abroad")}</p>
        <p className="text-[10.5px] text-text-muted">{t("welcome.place.abroad-body")}</p>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {[...ABROAD, ...extra].map((tz) => {
            const on = modules.clocks.includes(tz);
            return (
              <button
                key={tz}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(tz)}
                className={`welcome-chip ${on ? "welcome-chip--on" : ""}`}
              >
                <span aria-hidden="true">{flagFor(tz)}</span>
                {cityName(tz)}
                {on && <Icon name="checkmark" className="size-2.5" />}
              </button>
            );
          })}
        </div>
        <label className="field-shell mt-1 flex items-center gap-2 px-2">
          <Icon name="search" className="size-3 shrink-0 text-text-muted" />
          <input
            value={query}
            maxLength={LIMITS.SEARCH}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("welcome.place.search")}
            aria-label={t("welcome.place.search")}
            className="h-[28px] min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-text-muted"
          />
        </label>
        {results.length > 0 && (
          <div className="surface-card divide-y divide-divider">
            {results.map((city) => (
              <button
                key={city.timeZone}
                type="button"
                onClick={() => {
                  if (!modules.clocks.includes(city.timeZone)) toggle(city.timeZone);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] hover:bg-surface-hover"
              >
                <span aria-hidden="true">{flagFor(city.timeZone)}</span>
                <span className="min-w-0 flex-1 truncate">{city.city}</span>
                <span className="text-[10.5px] text-text-muted">{city.region}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The rashi, found by the first letter of a name, and the morning reading. */
function Rashi({ t }: { t: TFn }) {
  const [sign, setSign] = useState<RashiSign | null>(null);
  const [query, setQuery] = useState("");
  const [daily, setDaily] = useState(true);
  const matches = useSignSearch(query);
  const matched = matches ? SIGNS.filter((each) => matches.has(each.id)) : [];

  useEffect(() => {
    api
      .getSetting<string>(SIGN_KEY)
      .then((saved) => {
        if (saved && SIGNS.some((each) => each.id === saved)) setSign(saved as RashiSign);
      })
      .catch(() => {});
    api
      .getNotificationOptions()
      .then((options) => setDaily(options.dailyRashifal))
      .catch(() => {});
  }, []);

  const choose = (id: RashiSign) => {
    setSign(id);
    api.setSetting(SIGN_KEY, id).catch(() => {});
  };
  const setReading = (on: boolean) => {
    setDaily(on);
    api
      .getNotificationOptions()
      .then((options) => api.setNotificationOptions({ ...options, dailyRashifal: on }))
      .catch(() => {});
  };
  const chosen = SIGNS.find((each) => each.id === sign);

  return (
    <div className="space-y-3">
      <Heading icon="rashifal" title={t("welcome.rashi.title")} body={t("welcome.rashi.body")} />
      <label className="field-shell flex items-center gap-2 px-2">
        <Icon name="search" className="size-3 shrink-0 text-text-muted" />
        <input
          value={query}
          maxLength={LIMITS.SEARCH}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("rashifal.search-placeholder")}
          aria-label={t("rashifal.search-placeholder")}
          className="h-[28px] min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-text-muted"
        />
      </label>
      <p className="min-h-[15px] text-[10.5px] text-text-secondary" aria-live="polite">
        {chosen && !matches
          ? t("welcome.rashi.yours").replace("{sign}", chosen.ne)
          : matches
            ? matched.length === 0
              ? t("rashifal.no-match")
              : matched.map((each) => `${each.ne}: ${each.syllables.join(" ")}`).join(" · ")
            : t("rashifal.pick-hint")}
      </p>
      <SignGrid matches={matches} pressed={sign} onSelect={choose} />
      <div className="flex items-center justify-between gap-3 rounded-[10px] bg-surface px-3 py-2">
        <span className="min-w-0">
          <span className="block text-[12px] font-medium">{t("welcome.rashi.daily")}</span>
          <span className="block text-[10.5px] text-text-muted">
            {t("welcome.rashi.daily-body")}
          </span>
        </span>
        <Switch checked={daily} onChange={setReading} ariaLabel={t("welcome.rashi.daily")} />
      </div>
    </div>
  );
}

/** Half-hour steps from 6 in the morning to 11 at night. */
const TIMES: PlanTime[] = Array.from({ length: 36 }, (_, i) => ({
  hour: 6 + Math.floor(i / 2),
  minute: (i % 2) * 30,
}));

const timeId = (time: PlanTime) => `${time.hour}:${time.minute}`;

/** The workday, and the three breaks that come within it. */
function Day({ t }: { t: TFn }) {
  const { numerals } = useSettings();
  const [settings, setSettings] = useState<FocusSettings | null>(null);
  useEffect(() => {
    api
      .focusSnapshot()
      .then((snapshot) => setSettings(snapshot.settings))
      .catch(() => {});
  }, []);
  if (!settings)
    return <Heading icon="focus" title={t("welcome.day.title")} body={t("welcome.day.body")} />;

  const save = (next: FocusSettings) => {
    setSettings(next);
    api.setFocusSettings(next).catch(() => {});
  };
  const label = (time: PlanTime) => {
    const hour = time.hour % 12 === 0 ? 12 : time.hour % 12;
    return `${digits(hour, numerals)}:${digits(time.minute, numerals, 2)} ${time.hour < 12 ? "AM" : "PM"}`;
  };
  const options = TIMES.map((time) => ({ id: timeId(time), label: label(time) }));
  const pick = (id: string): PlanTime => {
    const [hour, minute] = id.split(":").map(Number);
    return { hour: hour ?? 9, minute: minute ?? 0 };
  };
  const breaks: {
    key: "eyes" | "move" | "water";
    icon: IconName;
    title: string;
    detail: string;
  }[] = [
    {
      key: "eyes",
      icon: "eye",
      title: t("welcome.day.eyes"),
      detail: t("welcome.day.every").replace("{n}", digits(settings.eyes.everyMinutes, numerals)),
    },
    {
      key: "move",
      icon: "walk",
      title: t("welcome.day.move"),
      detail: t("welcome.day.every").replace("{n}", digits(settings.move.everyMinutes, numerals)),
    },
    {
      key: "water",
      icon: "drop",
      title: t("welcome.day.water"),
      detail: t("welcome.day.every").replace("{n}", digits(settings.water.everyMinutes, numerals)),
    },
  ];

  return (
    <div className="space-y-3">
      <Heading icon="focus" title={t("welcome.day.title")} body={t("welcome.day.body")} />
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("welcome.day.start")}>
          <Select
            ariaLabel={t("welcome.day.start")}
            value={timeId(settings.startWorkAt)}
            onChange={(id) => save({ ...settings, startWorkAt: pick(id) })}
            options={options}
          />
        </Field>
        <Field label={t("welcome.day.stop")}>
          <Select
            ariaLabel={t("welcome.day.stop")}
            value={timeId(settings.stopWorkAt)}
            onChange={(id) => save({ ...settings, stopWorkAt: pick(id) })}
            options={options}
          />
        </Field>
      </div>
      <div className="surface-card divide-y divide-divider">
        {breaks.map((each) => (
          <div key={each.key} className="flex items-center gap-2.5 px-3 py-2">
            <span className="welcome__mini-badge">
              <Icon name={each.icon} className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-medium">{each.title}</span>
              <span className="block text-[10.5px] text-text-muted">{each.detail}</span>
            </span>
            <Switch
              checked={settings[each.key].enabled}
              onChange={(on) =>
                save({ ...settings, [each.key]: { ...settings[each.key], enabled: on } })
              }
              ariaLabel={each.title}
            />
          </div>
        ))}
      </div>
      <p className="text-center text-[10.5px] text-text-muted">{t("welcome.day.note")}</p>
    </div>
  );
}

const TOUR = [
  { icon: "calendar", title: "welcome.tour.calendar", body: "welcome.tour.calendar-body" },
  { icon: "bazar", title: "welcome.tour.bazar", body: "welcome.tour.bazar-body" },
  { icon: "news", title: "welcome.tour.news", body: "welcome.tour.news-body" },
  { icon: "rashifal", title: "welcome.tour.rashifal", body: "welcome.tour.rashifal-body" },
  { icon: "focus", title: "welcome.tour.routine", body: "welcome.tour.routine-body" },
  { icon: "games", title: "welcome.tour.games", body: "welcome.tour.games-body" },
] as const satisfies readonly { icon: IconName; title: string; body: string }[];

/** What's inside, a tile each, popping in one after another. */
function Tour({ t }: { t: TFn }) {
  return (
    <div className="space-y-3">
      <Heading emoji="✨" title={t("welcome.tour.title")} body={t("welcome.tour.body")} />
      <div className="grid grid-cols-2 gap-1.5">
        {TOUR.map((each, index) => (
          <div
            key={each.title}
            className="welcome-tile"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <span className="welcome__mini-badge">
              <Icon name={each.icon} className="size-3.5" />
            </span>
            <span className="mt-1.5 block text-[12px] font-semibold">{t(each.title)}</span>
            <span className="block text-[10.5px] leading-snug text-text-muted">{t(each.body)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** All set: confetti, and where Sajilo lives on this computer. */
function Done({ t }: { t: TFn }) {
  const where = isWindows
    ? "welcome.done.windows"
    : isLinux
      ? "welcome.done.linux"
      : "welcome.done.mac";
  return (
    <div className="relative space-y-4">
      <Confetti />
      <Heading emoji="🎉" title={t("welcome.done.title")} body={t("welcome.done.body")} />
      <div className="flex items-start gap-3 rounded-[12px] bg-surface p-3">
        <span className="welcome__mini-badge">
          <Icon name="pin" className="size-3.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold">{t("welcome.done.find")}</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-text-secondary">
            {t(where)}
          </span>
        </span>
      </div>
      <p className="text-center text-[10.5px] text-text-muted">{t("welcome.done.again")}</p>
    </div>
  );
}
