import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import {
  type ActiveBreak,
  api,
  type BreakOutcome,
  type FocusSnapshot,
  type Joke,
} from "../../shared/lib/ipc";
import { digits } from "../../shared/lib/numerals";
import { useFitWindow } from "../../shared/lib/use-fit-window";
import { KIND_ICONS, kindLabel, litres, useSentenceNumerals } from "./_lib/format";

const TITLES = {
  eyes: "break.eyes.title",
  move: "break.move.title",
  water: "break.water.title",
  endOfDay: "break.endOfDay.title",
  breakfast: "break.breakfast.title",
  lunch: "break.lunch.title",
  dinner: "break.dinner.title",
  bedtime: "break.bedtime.title",
} as const;

/** The plain line under the title, when jokes are off or a kind has none. */
const BODIES = {
  eyes: "break.eyes.body",
  move: "break.move.body",
  custom: "break.custom.body",
  endOfDay: "break.endOfDay.body",
  breakfast: "break.breakfast.body",
  lunch: "break.lunch.body",
  dinner: "break.dinner.body",
  bedtime: "break.bedtime.body",
} as const;

const RING = 2 * Math.PI * 17;
/** How long the "done" line stays before the card closes. */
const CHEER_MS = 1600;
/** A card still waiting after this long shakes once more. */
const NUDGE_MS = 30_000;

const HOLD_NOTES = {
  call: "break.after.call",
  fullscreen: "break.after.fullscreen",
  doNotDisturb: "break.after.dnd",
} as const;

/**
 * Seconds left on the card's countdown, redrawn a few times a second. The
 * countdown runs while hands are off the keyboard and mouse, so looking away
 * finishes the break by itself and a keystroke starts it over. Where input
 * idle can't be read, it runs on the clock instead.
 */
function useRemaining(startedAt: string | undefined, seconds: number) {
  const [now, setNow] = useState(() => Date.now());
  const [idle, setIdle] = useState<number | null>(null);
  useEffect(() => {
    if (!startedAt || seconds === 0) return;
    let live = true;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      api
        .focusIdleSeconds()
        .then((value) => {
          if (live) setIdle(typeof value === "number" ? value : null);
        })
        .catch(() => {
          if (live) setIdle(null);
        });
    }, 250);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [startedAt, seconds]);
  if (!startedAt) return seconds;
  const elapsed = Math.max(0, (now - Date.parse(startedAt)) / 1000);
  // Idle from before the card opened is not part of this break.
  const handsOff = idle === null ? elapsed : Math.min(idle, elapsed);
  return Math.max(0, seconds - handsOff);
}

/** The main button: the one that counts the break. A look away has none:
 * leaving the mouse alone is how it is taken. */
function mainAction(card: ActiveBreak): "done" | "drank" | null {
  if (card.kind === "eyes") return null;
  return card.kind === "water" ? "drank" : "done";
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
  const { t, language } = useSettings();
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
  // Both lines were dealt by the engine when the card opened, so they stay
  // put for as long as it is up.
  const [cheer, setCheer] = useState<Joke | null>(null);
  const cardCheer = card?.cheer ?? null;
  const finish = useCallback(
    (outcome: BreakOutcome) => {
      if (finishing.current) return;
      finishing.current = true;
      const close = () =>
        api.finishFocusBreak(outcome).catch(() => {
          finishing.current = false;
        });
      if (cardCheer && (outcome === "done" || outcome === "drank")) {
        setCheer(cardCheer);
        window.setTimeout(close, CHEER_MS);
      } else {
        void close();
      }
    },
    [cardCheer],
  );

  useEffect(() => {
    if (card && card.seconds > 0 && remaining <= 0) finish("done");
  }, [card, remaining, finish]);

  if (!snapshot || !card) return null;

  const waterLeft = Math.max(0, snapshot.settings.waterGoalMl - snapshot.today.waterMl);
  const waterLine = t("break.water.body").replace("{left}", litres(waterLeft, numerals));
  const plain = card.kind === "water" ? waterLine : t(BODIES[card.kind]);
  const said = cheer ?? card.joke;
  const body = said ? said[language] : plain;
  const title =
    card.kind === "custom" ? kindLabel(card.kind, snapshot.settings, t) : t(TITLES[card.kind]);
  const later = t("break.snooze").replace("{n}", digits(snapshot.snoozeMinutes, numerals));
  const main = mainAction(card);
  const heldNote = card.afterHold
    ? t(HOLD_NOTES[card.afterHold.reason]).replace("{n}", digits(card.afterHold.minutes, numerals))
    : null;

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
          {heldNote && (
            <p className="break-card__eyebrow" data-tauri-drag-region>
              {heldNote}
            </p>
          )}
          <p className="break-card__title" data-tauri-drag-region>
            {title}
            {card.preview && <span className="break-card__example">{t("break.example")}</span>}
          </p>
          <p className="break-card__body" data-tauri-drag-region>
            {body}
          </p>
          {/* A joke replaces the instruction, but never the number that matters. */}
          {card.joke && !cheer && card.kind === "water" && (
            <p className="break-card__meta" data-tauri-drag-region>
              {waterLine}
            </p>
          )}
          {card.seconds > 0 && !cheer && (
            <p className="break-card__meta" data-tauri-drag-region>
              {t("break.hands-off")}
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
        {card.canSnooze && (
          <button
            type="button"
            onClick={() => finish("snooze")}
            className="break-card__button break-card__button--quiet"
          >
            {later}
          </button>
        )}
        {main === "drank" && (
          <button
            type="button"
            onClick={() => finish("drank")}
            className="break-card__button break-card__button--main"
          >
            {t("break.drank").replace("{n}", digits(snapshot.waterStepMl, numerals))}
          </button>
        )}
        {main === "done" && (
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
