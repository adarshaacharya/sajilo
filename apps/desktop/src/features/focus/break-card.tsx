import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import type { translate } from "../../shared/lib/i18n";
import {
  type ActiveBreak,
  api,
  type BreakKind,
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

type TranslationKey = Parameters<typeof translate>[0];

/** What the main button says where "Done" would not fit the moment. */
const DONE_LABELS: Partial<Record<BreakKind, TranslationKey>> = {
  endOfDay: "break.endOfDay.done",
  breakfast: "break.meal.done",
  lunch: "break.meal.done",
  dinner: "break.meal.done",
  bedtime: "break.bedtime.done",
};

/** A plain line to leave on: going to eat or to bed is not a break taken, so
 * these cards get no cheer from the engine. */
const SEND_OFFS: Partial<Record<BreakKind, TranslationKey>> = {
  endOfDay: "break.endOfDay.send-off",
  breakfast: "break.meal.send-off",
  lunch: "break.meal.send-off",
  dinner: "break.meal.send-off",
  bedtime: "break.bedtime.send-off",
};

/** The cards whose words can be the user's own. */
type MessageKind = "eyes" | "move" | "water";
const MESSAGE_KINDS = new Set<BreakKind>(["eyes", "move", "water"]);

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
 * Seconds left on the card's countdown, redrawn a few times a second. It runs
 * on the clock from the moment the card opens, whatever the mouse and keys
 * are doing: a ring that stalls while someone types looks broken.
 */
function useCountdown(startedAt: string | undefined, seconds: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt || seconds === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [startedAt, seconds]);
  if (!startedAt) return seconds;
  const elapsed = Math.max(0, (now - Date.parse(startedAt)) / 1000);
  return Math.max(0, seconds - elapsed);
}

/** The main button: the one that counts the break. A look away has none:
 * its ring running out is how it is taken. */
function mainAction(card: ActiveBreak): "done" | "drank" | null {
  if (card.kind === "eyes") return null;
  return card.kind === "water" ? "drank" : "done";
}

/** Today's water against the goal. Logging from the card fills it to the new
 * total before the card goes, so the tap has something to show for it. */
function WaterBar({ ml, goalMl }: { ml: number; goalMl: number }) {
  const { t } = useSettings();
  const numerals = useSentenceNumerals();
  const share = goalMl > 0 ? Math.min(1, ml / goalMl) : 0;
  const amount = t("focus.water.amount")
    .replace("{done}", litres(ml, numerals))
    .replace("{goal}", litres(goalMl, numerals));
  return (
    <div className="break-card__water" data-tauri-drag-region>
      <span className="break-card__water-track" data-tauri-drag-region>
        <span className="break-card__water-fill" style={{ transform: `scaleX(${share})` }} />
      </span>
      <span className="break-card__water-amount tabular-nums" data-tauri-drag-region>
        {amount}
      </span>
    </div>
  );
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
  const remaining = useCountdown(card?.startedAt, card?.seconds ?? 0);

  // The card shakes as it arrives, and once more if it is still waiting, the
  // way a mistyped password shakes: noticed out of the corner of an eye
  // without a second sound. Re-keying the card replays the animation.
  const [shakes, setShakes] = useState(0);
  useEffect(() => {
    if (!card) return;
    const timer = window.setTimeout(() => setShakes((count) => count + 1), NUDGE_MS);
    return () => window.clearTimeout(timer);
  }, [card]);

  // A break taken earns a line before the card goes: the engine's cheer, a
  // meal's plain send-off, or water's bar filling to the new total. Skipping
  // or putting it off just closes it. The shell closes this window once the
  // tracker has no card.
  // The cheer was dealt by the engine when the card opened, so it stays put
  // for as long as the card is up.
  const [taken, setTaken] = useState(false);
  const [cheer, setCheer] = useState<Joke | null>(null);
  const [drankMl, setDrankMl] = useState(0);
  const cardCheer = card?.cheer ?? null;
  const kind = card?.kind;
  const glassMl = snapshot?.waterStepMl ?? 0;
  const bottleMl = snapshot?.waterBottleMl ?? 0;
  const finish = useCallback(
    (outcome: BreakOutcome) => {
      if (finishing.current) return;
      finishing.current = true;
      const close = () =>
        api.finishFocusBreak(outcome).catch(() => {
          finishing.current = false;
          setTaken(false);
          setCheer(null);
          setDrankMl(0);
        });
      const logged = outcome === "drank" ? glassMl : outcome === "drankBottle" ? bottleMl : 0;
      const lingers =
        (outcome === "done" || logged > 0) &&
        (cardCheer !== null || logged > 0 || (kind !== undefined && kind in SEND_OFFS));
      if (lingers) {
        setTaken(true);
        setCheer(cardCheer);
        setDrankMl(logged);
        window.setTimeout(close, CHEER_MS);
      } else {
        void close();
      }
    },
    [cardCheer, kind, glassMl, bottleMl],
  );

  useEffect(() => {
    if (card && card.seconds > 0 && remaining <= 0) finish("done");
  }, [card, remaining, finish]);

  if (!snapshot || !card) return null;

  const goalMl = snapshot.settings.waterGoalMl;
  const waterMl = snapshot.today.waterMl + drankMl;
  const waterLeft = Math.max(0, goalMl - waterMl);
  const waterLine =
    waterLeft > 0
      ? t("break.water.body").replace("{left}", litres(waterLeft, numerals))
      : t("break.water.goal-met");
  // The user's own words win over Sajilo's (the engine deals no joke then).
  const own = MESSAGE_KINDS.has(card.kind)
    ? snapshot.settings.messages?.[card.kind as MessageKind]
    : undefined;
  const plain = own || (card.kind === "water" ? waterLine : t(BODIES[card.kind]));
  const sendOff = SEND_OFFS[card.kind];
  const body = taken
    ? (cheer?.[language] ?? (sendOff ? t(sendOff) : plain))
    : (card.joke?.[language] ?? plain);
  const title =
    card.kind === "custom" ? kindLabel(card.kind, snapshot.settings, t) : t(TITLES[card.kind]);
  // Water's row carries two drink buttons, so its "later" says less.
  const later = t(card.kind === "water" ? "break.snooze-short" : "break.snooze").replace(
    "{n}",
    digits(card.snoozeMinutes, numerals),
  );
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
          {card.kind === "water" && <WaterBar ml={waterMl} goalMl={goalMl} />}
        </div>
        {card.seconds > 0 && <Countdown remaining={remaining} seconds={card.seconds} />}
      </div>

      {/* Laid out like a Mac dialog: the way out on the left, and the main
          action — the one that counts the break — on the far right. */}
      <div className="break-card__actions" hidden={taken} data-tauri-drag-region>
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
          <>
            <button
              type="button"
              onClick={() => finish("drank")}
              className="break-card__button break-card__button--main"
            >
              {t("break.drank").replace("{n}", digits(glassMl, numerals))}
            </button>
            <button
              type="button"
              onClick={() => finish("drankBottle")}
              className="break-card__button break-card__button--main"
            >
              {t("break.drank").replace("{n}", digits(bottleMl, numerals))}
            </button>
          </>
        )}
        {main === "done" && (
          <button
            type="button"
            onClick={() => finish("done")}
            className="break-card__button break-card__button--main"
          >
            {t(DONE_LABELS[card.kind] ?? "break.done")}
          </button>
        )}
      </div>
    </div>
  );
}
