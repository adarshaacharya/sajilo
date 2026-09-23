import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import { api, type BreakOutcome, type FocusSnapshot } from "../../shared/lib/ipc";
import { digits } from "../../shared/lib/numerals";
import { KIND_ICONS, kindLabel, litres, useSentenceNumerals } from "./_lib/format";
import { JOKES, pick } from "./_lib/jokes";

const TITLES = {
  eyes: "break.eyes.title",
  move: "break.move.title",
  water: "break.water.title",
  endOfDay: "break.endOfDay.title",
} as const;

/** The plain line under the title, when jokes are off or a kind has none. */
const BODIES = {
  eyes: "break.eyes.body",
  move: "break.move.body",
  custom: "break.custom.body",
  endOfDay: "break.endOfDay.body",
} as const;

const RING = 2 * Math.PI * 17;
/** Matches `CARD_WIDTH` in `commands::focus`; only the height follows content. */
const CARD_WIDTH = 380;
/** How long the "done" line stays before the card closes. */
const CHEER_MS = 1600;
/** A card still waiting after this long shakes once more. */
const NUDGE_MS = 30_000;

/** The card's own window, fitted to what it holds: the same card can be one
 * line of text in English and two in Nepali, and a fixed height leaves either
 * a gap or a clipped button. */
function useFitWindow(element: HTMLElement | null) {
  useLayoutEffect(() => {
    if (!element) return;
    const fit = () => {
      const height = Math.ceil(element.getBoundingClientRect().height);
      void import("@tauri-apps/api/window")
        .then(({ getCurrentWindow, LogicalSize }) =>
          getCurrentWindow().setSize(new LogicalSize(CARD_WIDTH, height)),
        )
        .catch(() => {});
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
}

/** Seconds left on the card's countdown, redrawn a few times a second. */
function useRemaining(startedAt: string | undefined, seconds: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt || seconds === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [startedAt, seconds]);
  if (!startedAt) return seconds;
  const elapsed = (now - Date.parse(startedAt)) / 1000;
  return Math.max(0, seconds - elapsed);
}

function Countdown({ remaining, seconds }: { remaining: number; seconds: number }) {
  const numerals = useSentenceNumerals();
  const whole = Math.ceil(remaining);
  const label =
    seconds >= 60
      ? `${digits(Math.floor(whole / 60), numerals)}:${digits(whole % 60, numerals, 2)}`
      : digits(whole, numerals);
  return (
    <span className="break-card__ring" aria-live="off" data-tauri-drag-region>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="17" className="break-card__ring-track" />
        <circle
          cx="20"
          cy="20"
          r="17"
          className="break-card__ring-fill"
          strokeDasharray={RING}
          strokeDashoffset={RING * (1 - remaining / seconds)}
        />
      </svg>
      <span className="break-card__ring-label tabular-nums">{label}</span>
    </span>
  );
}

/**
 * The break card: a small window at the top of the screen that stays until the
 * break is taken, put off or skipped. It never takes the keyboard — the shell
 * opens it unfocused — so it can interrupt a thought but not a sentence.
 */
export function BreakCard() {
  const { t } = useSettings();
  const numerals = useSentenceNumerals();
  const [snapshot, setSnapshot] = useState<FocusSnapshot | null>(null);
  const finishing = useRef(false);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useFitWindow(element);

  useEffect(() => {
    api
      .focusSnapshot()
      .then(setSnapshot)
      .catch(() => {});
  }, []);

  const card = snapshot?.activeBreak ?? null;
  const remaining = useRemaining(card?.startedAt, card?.seconds ?? 0);

  // The card shakes as it arrives, and once more if it is still waiting, the
  // way a mistyped password shakes: noticed out of the corner of an eye
  // without a second sound. Re-keying the card replays the animation.
  const [shakes, setShakes] = useState(0);
  useEffect(() => {
    if (!card) return;
    const timer = window.setTimeout(() => setShakes((count) => count + 1), NUDGE_MS);
    return () => window.clearTimeout(timer);
  }, [card]);

  // A break taken earns a line before the card goes; skipping or putting it
  // off just closes it. The shell closes this window once the tracker has no
  // card.
  const [cheer, setCheer] = useState<(typeof JOKES.done)[number] | null>(null);
  const jokes = snapshot?.settings.jokes ?? false;
  const startedAt = card?.startedAt ?? "";
  const finish = useCallback(
    (outcome: BreakOutcome) => {
      if (finishing.current) return;
      finishing.current = true;
      const close = () =>
        api.finishFocusBreak(outcome).catch(() => {
          finishing.current = false;
        });
      if (jokes && (outcome === "done" || outcome === "drank")) {
        setCheer(pick(JOKES.done, startedAt + outcome));
        window.setTimeout(close, CHEER_MS);
      } else {
        void close();
      }
    },
    [jokes, startedAt],
  );

  useEffect(() => {
    if (card && card.seconds > 0 && remaining <= 0) finish("done");
  }, [card, remaining, finish]);

  if (!snapshot || !card) return null;

  const waterLeft = Math.max(0, snapshot.settings.waterGoalMl - snapshot.today.waterMl);
  const waterLine = t("break.water.body").replace("{left}", litres(waterLeft, numerals));
  const plain = card.kind === "water" ? waterLine : t(BODIES[card.kind]);
  // The user's own reminder is their words, not ours: no joke over it.
  const joke = card.kind === "custom" ? null : JOKES[card.kind];
  const body = cheer ? t(cheer) : jokes && joke ? t(pick(joke, card.startedAt)) : plain;
  const title =
    card.kind === "custom" ? kindLabel(card.kind, snapshot.settings, t) : t(TITLES[card.kind]);
  const later = t("break.snooze").replace("{n}", digits(snapshot.snoozeMinutes, numerals));

  return (
    <div
      key={shakes}
      ref={setElement}
      className={`break-card break-card--${card.kind}`}
      role="alert"
      data-tauri-drag-region
    >
      {/* The whole card drags; Tauri only starts a drag on an element that
          carries the attribute itself, so the buttons stay plain buttons. */}
      <div className="flex items-start gap-3" data-tauri-drag-region>
        <span className="break-card__icon" data-tauri-drag-region>
          <Icon name={KIND_ICONS[card.kind]} className="size-5" />
        </span>
        <div className="min-w-0 flex-1" data-tauri-drag-region>
          <p className="break-card__title" data-tauri-drag-region>
            {title}
            {card.preview && <span className="break-card__example">{t("break.example")}</span>}
          </p>
          <p className="break-card__body" data-tauri-drag-region>
            {body}
          </p>
          {/* A joke replaces the instruction, but never the number that matters. */}
          {jokes && !cheer && card.kind === "water" && (
            <p className="break-card__meta" data-tauri-drag-region>
              {waterLine}
            </p>
          )}
        </div>
        {card.seconds > 0 && <Countdown remaining={remaining} seconds={card.seconds} />}
      </div>

      {/* Laid out like a Mac dialog: the way out on the left, and the main
          action — the one that counts the break — on the far right. */}
      <div className="break-card__actions" hidden={cheer !== null} data-tauri-drag-region>
        <button type="button" onClick={() => finish("skip")} className="btn-ghost mr-auto">
          {t("break.skip")}
        </button>
        <button
          type="button"
          onClick={() => finish("snooze")}
          className="break-card__button break-card__button--quiet"
        >
          {later}
        </button>
        {card.kind === "water" ? (
          <button
            type="button"
            onClick={() => finish("drank")}
            className="break-card__button break-card__button--main"
          >
            {t("break.drank").replace("{n}", digits(snapshot.waterStepMl, numerals))}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => finish("done")}
            className="break-card__button break-card__button--main"
          >
            {t(card.kind === "endOfDay" ? "break.endOfDay.done" : "break.done")}
          </button>
        )}
      </div>
    </div>
  );
}
