import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Icon, type IconName } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { api, type KeeperSnapshot } from "../../../shared/lib/ipc";
import { spring, useMotionEnabled } from "../../../shared/lib/motion";
import { digits } from "../../../shared/lib/numerals";
import type { IpoSnapshot } from "../../../types/api/IpoSnapshot";
import type { LoadState } from "../../../types/api/LoadState";
import { money } from "../../bazar/_lib/format";
import { sipIsClose, sipWhen, useSips } from "../../bazar/_lib/funds";
import {
  companyName,
  groupIssues,
  nepalToday,
  ratioText,
  shortCompanyName,
  subscriptionRatio,
} from "../../bazar/_lib/ipo";
import { useAppliedIpos } from "../../bazar/_lib/ipo-applied";
import { phaseLabel } from "../../bazar/_lib/ipo-labels";
import { personName, recordName } from "../../keeper/_lib/documents";
import { dueLabel } from "../../keeper/_lib/shared";
import { upcomingOf } from "../../keeper/_lib/upcoming";

/** Home is a glance: only what's due within a week earns a slide. Keeper's own
 * list looks further ahead. */
const KEEPER_HORIZON_DAYS = 7;

/** Short enough to show the next slide in a tray glance, long enough to read. */
const HOLD_MS = 2800;
/** A deadline that runs out today stays up long enough to be read twice. */
const URGENT_HOLD_MS = 5000;

type Slide = {
  id: string;
  icon: IconName;
  title: string;
  detail: string | null;
  when: string;
  urgent: boolean;
  hold: number;
  open: () => void;
};

/**
 * The home screen's one "what's coming" row.
 *
 * It holds the next observances by name, the IPO you can still apply to
 * while one is open, and whatever Keeper has due this week — taking turns in the same slot rather than adding a
 * card. The first calendar slide is whatever is next (often a tithi); the
 * next public holiday follows so a glance still sees a day off, not only a
 * lunar date. Each opens the full list. The tray panel is opened for a
 * glance, so the row always opens on the most urgent thing: an issue closing
 * today goes first, otherwise the nearest observance does. It stops while the
 * pointer or focus is on it, so a click never lands on the slide that just
 * arrived, and with reduced motion it never moves on its own. The trailing
 * chevron is the cue that the row opens a fuller screen.
 */
export function UpNext({ events }: { events: { name: string; when: string; holiday: boolean }[] }) {
  const { t, numerals, modules } = useSettings();
  const navigate = useNavigate();
  const motionEnabled = useMotionEnabled();
  const { applied, loaded } = useAppliedIpos();
  const [ipos, setIpos] = useState<LoadState<IpoSnapshot>>();
  const [held, setHeld] = useState(false);
  const [keeper, setKeeper] = useState<KeeperSnapshot>();
  const { sips } = useSips();

  useEffect(() => {
    if (!modules.keeperEnabled) return;
    api
      .keeperSnapshot()
      .then(setKeeper)
      .catch(() => {});
  }, [modules.keeperEnabled]);

  useEffect(() => {
    if (!modules.bazarEnabled) return;
    api
      .getIpos(false)
      .then(setIpos)
      .catch(() => {});
  }, [modules.bazarEnabled]);

  const today = nepalToday();
  // Only a fresh list may put a deadline on home. CDSC closes an oversubscribed
  // issue early, so an older copy could call an issue open after it shut —
  // Bazar still shows that copy, labelled; home just stays quiet.
  const open = useMemo(() => {
    if (!modules.bazarEnabled || !loaded || ipos?.status !== "fresh") return [];
    return groupIssues(ipos.value.issues, today).open.filter(
      (entry) => entry.issue.openToPublic && !applied.has(entry.key),
    );
  }, [applied, ipos, loaded, modules.bazarEnabled, today]);

  const count = (n: number) => digits(n, numerals);
  const slides: Slide[] = [];
  const soonest = open[0];
  let ipoSlide: Slide | null = null;

  if (soonest) {
    const urgent = soonest.phase.kind === "open" && soonest.phase.daysLeft === 0;
    const name = soonest.issue.symbol ?? shortCompanyName(companyName(soonest.issue));
    const when = phaseLabel(soonest.phase, t, count) ?? "";
    const hold = urgent ? URGENT_HOLD_MS : HOLD_MS;

    if (open.length === 1) {
      const ratio = subscriptionRatio(soonest.issue);
      ipoSlide = {
        id: `ipo:${soonest.key}`,
        icon: "interest",
        title: t("dashboard.ipo-title").replace("{name}", name),
        detail: ratio != null ? t("stocks.ipo-subscribed").replace("{x}", ratioText(ratio)) : null,
        when,
        urgent,
        hold,
        open: () => navigate(`/bazar?tab=stocks&ipo=${encodeURIComponent(soonest.key)}`),
      };
    } else {
      ipoSlide = {
        id: `ipos:${open.map((entry) => entry.key).join("|")}`,
        icon: "interest",
        title: t("dashboard.ipos-open").replace("{n}", count(open.length)),
        detail: name,
        when,
        urgent,
        hold,
        open: () => navigate("/bazar?tab=stocks&ipos=1"),
      };
    }
  }

  const due =
    modules.keeperEnabled && keeper
      ? upcomingOf(keeper.records, keeper.items).filter(
          (entry) => entry.days <= KEEPER_HORIZON_DAYS,
        )
      : [];
  let keeperSlide: Slide | null = null;
  const first = due[0];
  if (first) {
    const name = first.record ? recordName(t, first.record) : (first.item?.title ?? "");
    const personId = first.record?.personId ?? first.item?.personId ?? null;
    keeperSlide = {
      id: `keeper:${due.map((entry) => `${entry.key}:${entry.days}`).join("|")}`,
      icon: "keeper",
      title: due.length === 1 ? name : t("dashboard.keeper-due").replace("{n}", count(due.length)),
      detail:
        due.length === 1 ? (personId ? personName(t, keeper?.people ?? [], personId) : null) : name,
      when: dueLabel(t, first.days),
      // Today, tomorrow, or already late: lead with it.
      urgent: first.days <= 1,
      hold: first.days <= 1 ? URGENT_HOLD_MS : HOLD_MS,
      open: () => navigate("/keeper"),
    };
  }

  // A SIP payment three days out or less, from the same schedule the funds
  // screen counts down. Due today, or missed and still owed, leads the row.
  const sipDue = modules.bazarEnabled ? sips.filter(sipIsClose) : [];
  let sipSlide: Slide | null = null;
  const nextSip = sipDue[0];
  if (nextSip) {
    const urgent = nextSip.days <= 0;
    sipSlide = {
      id: `sip:${sipDue.map((sip) => `${sip.symbol}:${sip.due}`).join("|")}`,
      icon: "banknote",
      title:
        sipDue.length === 1
          ? t("dashboard.sip-title").replace("{name}", nextSip.name)
          : t("funds.sip-chip-many").replace("{n}", count(sipDue.length)),
      detail: sipDue.length === 1 && nextSip.amount ? `Rs ${money.format(nextSip.amount)}` : null,
      when: sipWhen(t, nextSip.days),
      urgent,
      hold: urgent ? URGENT_HOLD_MS : HOLD_MS,
      open: () => navigate("/bazar?tab=stocks&view=funds"),
    };
  }

  if (sipSlide?.urgent) slides.push(sipSlide);
  if (keeperSlide?.urgent) slides.push(keeperSlide);
  if (ipoSlide?.urgent) slides.push(ipoSlide);
  for (const event of events) {
    slides.push({
      id: `event:${event.holiday ? "holiday" : "day"}:${event.name}:${event.when}`,
      icon: event.holiday ? "holiday" : "festival",
      title: event.name,
      detail: null,
      when: event.when,
      urgent: false,
      hold: HOLD_MS,
      open: () => navigate("/events"),
    });
  }
  if (ipoSlide && !ipoSlide.urgent) slides.push(ipoSlide);
  if (keeperSlide && !keeperSlide.urgent) slides.push(keeperSlide);
  if (sipSlide && !sipSlide.urgent) slides.push(sipSlide);

  // A different set of slides starts over on the first, most urgent one.
  const signature = slides.map((slide) => slide.id).join("\n");
  const [shown, setShown] = useState({ signature, index: 0 });
  if (shown.signature !== signature) setShown({ signature, index: 0 });

  const total = slides.length;
  const index = shown.signature === signature ? Math.min(shown.index, total - 1) : 0;
  const current = slides[index];
  const hold = current?.hold ?? HOLD_MS;
  const rotates = total > 1 && motionEnabled && !held;

  useEffect(() => {
    if (!rotates) return;
    const next = (index + 1) % total;
    const timer = window.setTimeout(() => setShown({ signature, index: next }), hold);
    return () => window.clearTimeout(timer);
  }, [hold, index, rotates, signature, total]);

  if (!current) return null;

  return (
    <section
      aria-label={t("dashboard.up-next")}
      aria-roledescription="carousel"
      className="surface-card flex items-stretch overflow-hidden"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(focus) => {
        if (!focus.currentTarget.contains(focus.relatedTarget as Node | null)) setHeld(false);
      }}
    >
      <div className="relative h-9 min-w-0 flex-1" aria-live={rotates ? "off" : "polite"}>
        <AnimatePresence initial={false}>
          <motion.button
            key={current.id}
            type="button"
            onClick={current.open}
            initial={motionEnabled ? { y: "100%", opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            exit={motionEnabled ? { y: "-100%", opacity: 0 } : { opacity: 0 }}
            transition={motionEnabled ? spring.snappy : { duration: 0 }}
            className="absolute inset-0 flex w-full cursor-pointer items-center gap-2 px-2.5 text-left active:scale-[0.99]"
          >
            <Icon
              name={current.icon}
              className="size-3.5 shrink-0 text-[color:var(--color-accent-mark)]"
            />
            <span className="min-w-0 flex-1 truncate text-[12px]">
              {current.title}
              {current.detail && (
                <span className="ml-1.5 text-[10px] text-text-muted">{current.detail}</span>
              )}
            </span>
            <span
              className={`flex shrink-0 items-center gap-1 text-[11px] ${
                current.urgent
                  ? "font-medium text-[color:var(--color-accent-mark)]"
                  : "text-text-muted"
              }`}
            >
              {current.when}
              <span aria-hidden className="text-[13px] leading-none">
                ›
              </span>
            </span>
          </motion.button>
        </AnimatePresence>
      </div>
    </section>
  );
}
