import { useEffect, useRef, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import type { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import type { JhandiFace } from "../../../types/api/JhandiFace";
import { useJhandi } from "../games-data";
import { Confetti, GameOver } from "./game-over";

type TFn = ReturnType<typeof useSettings>["t"];

/** The roll, in ms: the cup comes down over the dice, rattles at least this
 * long (longer if the shell is slow), and lifts; the dice settle one after
 * another as it does. Unhurried, so the reveal is a moment. */
const CUP_DOWN_MS = 350;
const RATTLE_MS = 900;
const CUP_UP_MS = 450;
const SETTLE_GAP_MS = 70;
/** How long the mat shows what each face paid before it goes back to the
 * bets, still down for the next roll. */
const SHOW_RESULT_MS = 2400;
/** How long the purse takes to count to its new total. */
const COUNT_MS = 700;
/** A face pays from this many dice. */
const TO_WIN = 2;

const NONE = [0, 0, 0, 0, 0, 0];
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
const sum = (list: number[]) => list.reduce((total, n) => total + n, 0);

/** Betting, the cup over the dice, or the dice showing what they paid. */
type Phase = "betting" | "rolling" | "result";

/**
 * झन्डी बुर्जा: put pretend coins on faces of the mat, and the cup goes over
 * six dice, rattles and lifts. A face on two or more dice pays its stake
 * once for each and gives the stake back; one or none, and it's lost. Then
 * the same bets again, or new ones.
 */
export function JhandiBurja({ t }: { t: TFn }) {
  const { data, mutate } = useJhandi();
  const [stake, setStake] = useState(5);
  const [bets, setBets] = useState<number[]>(NONE);
  const [phase, setPhase] = useState<Phase>("betting");
  // Whether the cup is over the dice.
  const [covered, setCovered] = useState(false);
  // Counts rolls on this screen, so each result's burst plays afresh.
  const [round, setRound] = useState(0);
  // Whether the mat has gone back from what the roll paid to the bets.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    if (phase !== "result") return;
    const timer = window.setTimeout(() => setSettled(true), SHOW_RESULT_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The empty-purse popup, until "See the dice" folds it.
  const [closed, setClosed] = useState(false);
  // Whether the screen is still open, so a roll stops if it closes. Set on
  // every mount: React may mount, unmount and mount again.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const shownPurse = useCountTo(data?.purse ?? 0);

  if (!data) return null;
  const { faces, purse } = data;
  const staked = sum(bets);
  const last = phase === "result" ? data.last : null;

  /** Any change to the bets starts betting again, from the bets as they are. */
  const change = (next: (now: number[]) => number[]) => {
    if (busy) return;
    setPhase("betting");
    setError(null);
    setBets(next);
  };
  const put = (index: number) =>
    change((now) => {
      const room = purse - sum(now);
      return room <= 0
        ? now
        : now.map((bet, i) => (i === index ? bet + Math.min(stake, room) : bet));
    });
  const takeOff = (index: number) => change((now) => now.map((bet, i) => (i === index ? 0 : bet)));

  /** Rolls for `placed`: the bets on the mat, or the last ones again. Each
   * round is settled, as at a real mat: once the dice are seen, the mat is
   * cleared for the next bet. */
  const roll = async (placed: number[]) => {
    const down = sum(placed);
    if (busy || down === 0 || down > purse) return;
    setBusy(true);
    setError(null);
    setClosed(false);
    setPhase("rolling");
    setCovered(true);
    try {
      const [view] = await Promise.all([api.jhandiRoll(placed), wait(CUP_DOWN_MS + RATTLE_MS)]);
      if (!alive.current) return;
      // The dice change under the cup; it lifts to show them.
      await mutate(view, { revalidate: false });
      setRound((n) => n + 1);
      setBets(NONE);
      setCovered(false);
      await wait(CUP_UP_MS);
      setPhase("result");
    } catch (problem) {
      setCovered(false);
      setPhase("betting");
      setError(String(problem));
    } finally {
      setBusy(false);
    }
  };

  const clear = () => change(() => NONE);

  const refill = async () => {
    setBets(NONE);
    setPhase("betting");
    setClosed(false);
    await mutate(await api.jhandiRefill(), { revalidate: false });
  };

  // What lies on the cloth: the last roll, or before any, one of each face.
  const dice = data.last?.dice ?? faces;
  // The dice keep showing what the roll paid; the mat shows it for a
  // moment, then clears for the next bet.
  const rolled = last?.bets ?? bets;
  const pays = (index: number) =>
    last != null && (rolled[index] ?? 0) > 0 && (last.counts[index] ?? 0) >= TO_WIN;
  const bigWin =
    last != null && faces.some((_, i) => (rolled[i] ?? 0) > 0 && (last.counts[i] ?? 0) >= 3);
  const outcome = settled ? null : last;
  const broke = purse === 0 && !busy;
  // The last round's bets, offered again in one tap while the mat is empty
  // and the purse covers them.
  const again = data.last?.bets ?? NONE;
  const canRepeat = staked === 0 && sum(again) > 0 && sum(again) <= purse;

  const status = error
    ? error
    : phase === "rolling"
      ? t("jhandi.rolling")
      : last
        ? last.net > 0
          ? t("jhandi.won").replace("{n}", String(last.net))
          : last.net < 0
            ? t("jhandi.lost").replace("{n}", String(-last.net))
            : t("jhandi.even")
        : staked > 0
          ? t("jhandi.ready").replace("{n}", String(staked))
          : t("jhandi.place");

  return (
    <div className="space-y-2.5">
      <section className="surface-card flex items-center gap-2.5 px-3 py-2.5">
        <span className="jhandi-coin" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] text-text-muted">{t("jhandi.purse")}</p>
          <p className="text-[18px] font-semibold leading-tight tabular-nums">{shownPurse}</p>
        </div>
        <div className="text-right">
          <p className="text-[10.5px] text-text-muted">{t("jhandi.on-mat")}</p>
          <p className="text-[18px] font-semibold leading-tight tabular-nums">{staked}</p>
        </div>
      </section>

      <div className="jhandi-tray">
        {bigWin && <Confetti />}
        {dice.map((face, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: six dice in place
            key={`${round}.${i}`}
            className={`jhandi-die ${round > 0 && phase !== "betting" ? "jhandi-die--settle" : ""} ${
              last ? (pays(faces.indexOf(face)) ? "jhandi-die--hit" : "jhandi-die--dim") : ""
            }`}
            style={{ animationDelay: `${i * SETTLE_GAP_MS}ms` }}
          >
            <FaceMark face={face} />
          </span>
        ))}
        <span className={`jhandi-cup ${covered ? "jhandi-cup--on" : ""}`} aria-hidden="true" />
        {last && last.net !== 0 && (
          <span
            key={round}
            className={`jhandi-burst ${last.net > 0 ? "jhandi-burst--won" : "jhandi-burst--lost"}`}
            aria-hidden="true"
          >
            <span>{last.net > 0 ? `+${last.net}` : `−${-last.net}`}</span>
          </span>
        )}
      </div>

      <p
        className={`px-1 text-center text-[12px] font-semibold leading-snug ${
          error || (last && last.net < 0)
            ? "text-holiday"
            : last && last.net > 0
              ? "text-positive"
              : ""
        }`}
        aria-live="polite"
      >
        {status}
      </p>

      <div className="jhandi-mat">
        {faces.map((face, i) => {
          const bet = (outcome ? outcome.bets : bets)[i] ?? 0;
          const count = outcome?.counts[i] ?? 0;
          const [name, gloss] = t(`jhandi.face.${face}`).split(" · ");
          const won = outcome != null && pays(i);
          return (
            <div
              key={face}
              className={`jhandi-cell ${bet > 0 ? "jhandi-cell--bet" : ""} ${
                outcome && bet > 0 ? (won ? "jhandi-cell--won" : "jhandi-cell--lost") : ""
              }`}
            >
              <button
                type="button"
                onClick={() => put(i)}
                disabled={busy || broke}
                className="jhandi-cell__tap"
                aria-label={`${name}${bet > 0 ? `, ${bet}` : ""}`}
              />
              {outcome && count > 0 && <span className="jhandi-cell__count">×{count}</span>}
              {!outcome && bet > 0 && !busy && (
                <button
                  type="button"
                  onClick={() => takeOff(i)}
                  className="jhandi-cell__off"
                  aria-label={t("jhandi.take-off").replace("{face}", name ?? "")}
                >
                  <Icon name="close" className="size-2.5" />
                </button>
              )}
              <span className="jhandi-mark">
                <FaceMark face={face} />
              </span>
              <span className="jhandi-cell__name">{name}</span>
              {gloss && <span className="jhandi-cell__gloss">{gloss}</span>}
              {bet > 0 && (
                <span className="jhandi-cell__stake">
                  {outcome ? (won ? `+${bet * count}` : `−${bet}`) : bet}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[10.5px] text-text-muted">{t("jhandi.coin")}</span>
        <div className="flex flex-1 items-center gap-1.5">
          {data.stakes.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={stake === value}
              aria-label={`${t("jhandi.coin")}: ${value}`}
              onClick={() => setStake(value)}
              className={`jhandi-chip ${stake === value ? "jhandi-chip--on" : ""}`}
            >
              {value}
            </button>
          ))}
        </div>
        {phase === "betting" && staked > 0 && (
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="settings-btn h-[30px] px-3 text-[11.5px]"
          >
            {t("jhandi.clear")}
          </button>
        )}
      </div>

      {broke ? (
        <button
          type="button"
          onClick={() => void refill()}
          className="settings-btn settings-btn--accent h-10 w-full justify-center text-[13px]"
        >
          <Icon name="refresh" className="size-3.5" />
          {t("jhandi.refill").replace("{n}", String(data.newPurse))}
        </button>
      ) : canRepeat ? (
        <button
          type="button"
          onClick={() => void roll(again)}
          disabled={busy}
          className="settings-btn settings-btn--accent h-10 w-full justify-center text-[13px]"
        >
          <Icon name="refresh" className="size-3.5" />
          {t("jhandi.same-again").replace("{n}", String(sum(again)))}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void roll(bets)}
          disabled={busy || staked === 0}
          className="settings-btn settings-btn--accent h-10 w-full justify-center text-[13px]"
        >
          <Icon name="jhandi" className="size-4" />
          {staked > 0 ? t("jhandi.roll-with").replace("{n}", String(staked)) : t("jhandi.roll")}
        </button>
      )}
      <p className="text-center text-[10px] text-text-muted">{t("jhandi.pretend")}</p>

      {broke && !closed && phase !== "rolling" && (
        <GameOver
          result="lost"
          title={t("jhandi.broke")}
          detail={t("jhandi.broke-detail").replace("{n}", String(data.newPurse))}
          stats={[
            { value: String(data.stats.bestPurse), label: t("jhandi.stat.best") },
            { value: String(data.stats.biggestWin), label: t("jhandi.stat.biggest") },
            { value: String(data.stats.rounds), label: t("jhandi.stat.rounds") },
          ]}
          againLabel={t("jhandi.refill").replace("{n}", String(data.newPurse))}
          onAgain={() => void refill()}
          closeLabel={t("jhandi.see-dice")}
          onClose={() => setClosed(true)}
        />
      )}
    </div>
  );
}

/** `value`, counted to from wherever it was over a moment, so a win is seen
 * arriving rather than just being there. */
function useCountTo(value: number) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const began = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const done = Math.min(1, (now - began) / COUNT_MS);
      const eased = 1 - (1 - done) ** 3;
      const at = Math.round(start + (value - start) * eased);
      from.current = at;
      setShown(at);
      if (done < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}

/** A face as the dice and the mat print it, in the folk style of the real
 * set: black spade and club, red heart, diamond, crown and flags, ringed
 * "eyes" and hatching cut out in the paper's colour. The colours come from
 * where it sits (`--ink`, `--red`, `--paper`, and `--edge` around the red
 * shapes), so one drawing serves the yellow dice and the red mat. */
function FaceMark({ face }: { face: JhandiFace }) {
  const ink = "var(--ink)";
  const red = "var(--red)";
  const paper = "var(--paper)";
  const cut = { fill: "none", stroke: paper, strokeWidth: 1.3, strokeLinecap: "round" } as const;
  const line = { fill: "none", stroke: ink, strokeWidth: 1.6, strokeLinecap: "round" } as const;
  const edge = { stroke: "var(--edge)", strokeWidth: 1.6, strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 48 48" className="size-full" aria-hidden="true">
      {face === "hukum" && (
        <>
          <path
            d="M24 4C29 12 41 18 41 28.5c0 5-3.6 8.5-8 8.5-2.6 0-4.6-1-6-2.6.5 3.3 2.2 5.6 4.6 7.1H16.4c2.4-1.5 4.1-3.8 4.6-7.1-1.4 1.6-3.4 2.6-6 2.6-4.4 0-8-3.5-8-8.5C7 18 19 12 24 4z"
            fill={ink}
          />
          <Eye x={16.5} y={28.5} r={5.6} tone={ink} />
          <Eye x={31.5} y={28.5} r={5.6} tone={ink} />
          <path d="M19 19l5-6 5 6M21 21.5l3-3.5 3 3.5" {...cut} />
          <path d="M16 41.5c-3 0-4.5-1.5-4-3.5M32 41.5c3 0 4.5-1.5 4-3.5" {...line} />
        </>
      )}
      {face === "burja" && (
        <>
          {[200, 220, 240, 260, 280, 300, 320, 340].map((angle) => (
            <circle
              key={angle}
              cx={24 + 18 * Math.cos((angle * Math.PI) / 180)}
              cy={27 + 18 * Math.sin((angle * Math.PI) / 180)}
              r={2}
              fill={red}
              stroke={ink}
              strokeWidth={0.8}
            />
          ))}
          <path d="M24 3v9M20.5 6.5h7" {...line} strokeWidth={2.2} />
          <path
            d="M10.5 34L8.5 19.5c4.5 3.5 8.5 3.2 10.5-1L24 12l5 6.5c2 4.2 6 4.5 10.5 1L37.5 34z"
            fill={red}
            stroke={ink}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
          <path d="M15.5 31l1.4-6.5M32.5 31l-1.4-6.5M20 31.5l.5-7M28 31.5l-.5-7" {...cut} />
          <circle cx={24} cy={25} r={2.6} fill={paper} />
          <circle cx={24} cy={25} r={1.2} fill={ink} />
          <rect x={9.5} y={34} width={29} height={5} rx={1} fill={ink} />
          {[16, 24, 32].map((x) => (
            <circle key={x} cx={x} cy={36.5} r={1} fill={paper} />
          ))}
          <path d="M12 43.5c4-2 8-2 12 0 4-2 8-2 12 0" {...line} strokeWidth={1.4} />
        </>
      )}
      {face === "paan" && (
        <>
          <path
            d="M24 42C14 35 5 28 5 18.5 5 12.6 9.4 8 15 8c4 0 7.3 2.3 9 5.6C25.7 10.3 29 8 33 8c5.6 0 10 4.6 10 10.5C43 28 34 35 24 42z"
            fill={red}
            {...edge}
          />
          <Eye x={16} y={19} r={5.4} tone={red} />
          <Eye x={32} y={19} r={5.4} tone={red} />
          <path
            d="M15 26l9 7.5 9-7.5M18 29.5l6 5 6-5M20 27l4-3.5 4 3.5"
            {...cut}
            strokeWidth={1.2}
          />
        </>
      )}
      {face === "chidi" && (
        <>
          <path d="M24 24c0 7-3 12-9 15.5h18C27 36 24 31 24 24z" fill={ink} />
          <path d="M15 39.5c-3 .3-5-1-4.6-3M33 39.5c3 .3 5-1 4.6-3" {...line} />
          <Eye x={24} y={13} r={8.5} tone={ink} ring />
          <Eye x={14.5} y={27} r={8.5} tone={ink} ring />
          <Eye x={33.5} y={27} r={8.5} tone={ink} ring />
        </>
      )}
      {face === "jhanda" && (
        <>
          {[false, true].map((mirrored) => (
            <g
              key={String(mirrored)}
              transform={mirrored ? "translate(48 0) scale(-1 1)" : undefined}
            >
              <path d="M35 44L13 5" {...line} strokeWidth={2} />
              <circle cx={13} cy={5} r={1.7} fill={ink} />
              <path
                d="M15.6 9.7C7 12 4 22 7 31c5-3 11-3 18.1-4.5z"
                fill={red}
                stroke={ink}
                strokeWidth={1.4}
                strokeLinejoin="round"
              />
              <path d="M9 17c3 2 7 3 10 3M8 23c4 1.5 8 2 13 1.5" {...cut} strokeWidth={1.1} />
            </g>
          ))}
          <path
            d="M24 12c-2.4 3.4-2.4 6 0 8.4 2.4-2.4 2.4-5 0-8.4z"
            fill={red}
            stroke={ink}
            strokeWidth={0.9}
          />
        </>
      )}
      {face === "itta" && (
        <>
          <path d="M24 4l18 20-18 20L6 24z" fill={red} {...edge} />
          <path d="M24 11.5l11.5 12.5L24 36.5 12.5 24z" {...cut} />
          <path
            d="M24 15.5v3M24 29.5v3M15.5 24h3M29.5 24h3M18.6 18.6l2 2M27.4 27.4l2 2M29.4 18.6l-2 2M20.6 27.4l-2 2"
            {...cut}
          />
          <circle cx={24} cy={24} r={4} fill={paper} />
          <circle cx={24} cy={24} r={2} fill={ink} />
        </>
      )}
    </svg>
  );
}

/** The ringed "eye" the folk faces carry: rings of the paper's colour cut
 * into the shape, and with `ring`, a second band (the club's three discs). */
function Eye({
  x,
  y,
  r,
  tone,
  ring = false,
}: {
  x: number;
  y: number;
  r: number;
  tone: string;
  ring?: boolean;
}) {
  return (
    <>
      {ring && <circle cx={x} cy={y} r={r} fill={tone} />}
      <circle cx={x} cy={y} r={ring ? r * 0.72 : r} fill="var(--paper)" />
      <circle cx={x} cy={y} r={(ring ? r * 0.72 : r) * 0.66} fill={tone} />
      <circle cx={x} cy={y} r={(ring ? r * 0.72 : r) * 0.26} fill="var(--paper)" />
    </>
  );
}
