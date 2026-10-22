import { useEffect, useRef, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import type { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import type { JhandiFace } from "../../../types/api/JhandiFace";
import { useJhandi } from "../games-data";
import { Confetti, GameOver } from "./game-over";

type TFn = ReturnType<typeof useSettings>["t"];

/** How long the dice tumble before the first lands, in ms, then the beat
 * between one die landing and the next: unhurried, so each can be read. */
const TUMBLE_MS = 850;
const LAND_GAP_MS = 120;
/** A tumbling die shows a new face this often. */
const FLICK_MS = 110;
/** A face pays from this many dice. */
const TO_WIN = 2;

const NONE = [0, 0, 0, 0, 0, 0];
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
const sum = (list: number[]) => list.reduce((total, n) => total + n, 0);

/**
 * झन्डी बुर्जा: put pretend coins on faces of the mat, roll six dice. A face
 * on two or more dice pays its stake once for each and gives the stake
 * back; one or none, and it's lost. The bets stay down for the next roll.
 */
export function JhandiBurja({ t }: { t: TFn }) {
  const { data, mutate } = useJhandi();
  const [stake, setStake] = useState(5);
  const [bets, setBets] = useState<number[]>(NONE);
  // The faces while the dice tumble; `null` once they lie still.
  const [tumbling, setTumbling] = useState<JhandiFace[] | null>(null);
  const [landed, setLanded] = useState(0);
  // Whether the last roll is the one these bets were placed for, so the
  // mat shows what each face won.
  const [fresh, setFresh] = useState(false);
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

  if (!data) return null;
  const { faces, purse } = data;
  const staked = sum(bets);
  const last = fresh ? data.last : null;
  const rolling = tumbling !== null;

  const put = (index: number) => {
    if (busy) return;
    const room = purse - staked;
    if (room <= 0) return;
    setFresh(false);
    setError(null);
    setBets((now) => now.map((bet, i) => (i === index ? bet + Math.min(stake, room) : bet)));
  };

  const roll = async () => {
    if (busy || staked === 0 || staked > purse) return;
    setBusy(true);
    setError(null);
    setClosed(false);
    setFresh(false);
    // The dice tumble from the tap, while the shell rolls; once it answers
    // and they've tumbled a while, they land one by one on its faces.
    const any = () => faces[Math.floor(Math.random() * faces.length)] ?? "jhanda";
    let final: JhandiFace[] = [];
    let down = 0;
    const shake = () => setTumbling(faces.map((_, i) => (i < down ? (final[i] ?? any()) : any())));
    setLanded(0);
    shake();
    const flick = window.setInterval(shake, FLICK_MS);
    try {
      const [view] = await Promise.all([api.jhandiRoll(bets), wait(TUMBLE_MS)]);
      final = view.last?.dice ?? [];
      for (down = 1; down <= final.length; down++) {
        if (!alive.current) return;
        setLanded(down);
        shake();
        await wait(LAND_GAP_MS);
      }
      await mutate(view, { revalidate: false });
      setFresh(true);
      // The same bets again next roll, while the purse covers them.
      if (staked > view.purse) setBets(NONE);
    } catch (problem) {
      setError(String(problem));
    } finally {
      window.clearInterval(flick);
      setTumbling(null);
      setBusy(false);
    }
  };

  const refill = async () => {
    setBets(NONE);
    setFresh(false);
    setClosed(false);
    await mutate(await api.jhandiRefill(), { revalidate: false });
  };

  // What lies on the cloth: tumbling dice, the last roll, or before any
  // roll, one of each face.
  const dice = tumbling ?? data.last?.dice ?? faces;
  // Right after a roll the mat shows that roll's bets; after, the new ones.
  const placed = last?.bets ?? bets;
  const pays = (face: JhandiFace) => {
    const index = faces.indexOf(face);
    return last != null && (placed[index] ?? 0) > 0 && (last.counts[index] ?? 0) >= TO_WIN;
  };
  const bigWin =
    last != null && faces.some((_, i) => (placed[i] ?? 0) > 0 && (last.counts[i] ?? 0) >= 3);
  const broke = purse === 0 && !busy;

  const status = error
    ? error
    : rolling
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
          <p className="text-[18px] font-semibold leading-tight tabular-nums">{purse - staked}</p>
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
            key={i}
            className={`jhandi-die ${
              rolling ? (i < landed ? "jhandi-die--land" : "jhandi-die--tumble") : ""
            } ${last ? (pays(face) ? "jhandi-die--hit" : "jhandi-die--dim") : ""}`}
            style={{ animationDelay: rolling && i >= landed ? `${i * -70}ms` : undefined }}
          >
            <FaceMark face={face} />
          </span>
        ))}
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
          const bet = placed[i] ?? 0;
          const count = last?.counts[i] ?? 0;
          const [name, gloss] = t(`jhandi.face.${face}`).split(" · ");
          const won = last != null && bet > 0 && count >= TO_WIN;
          return (
            <button
              key={face}
              type="button"
              onClick={() => put(i)}
              disabled={busy || broke}
              className={`jhandi-cell ${bet > 0 ? "jhandi-cell--bet" : ""} ${
                last && bet > 0 ? (won ? "jhandi-cell--won" : "jhandi-cell--lost") : ""
              }`}
              aria-label={`${name}${bet > 0 ? `, ${bet}` : ""}`}
            >
              {last && count > 0 && <span className="jhandi-cell__count">×{count}</span>}
              <span className="jhandi-mark">
                <FaceMark face={face} />
              </span>
              <span className="jhandi-cell__name">{name}</span>
              {gloss && <span className="jhandi-cell__gloss">{gloss}</span>}
              {bet > 0 && (
                <span className="jhandi-cell__stake">
                  {last ? (won ? `+${bet * count}` : `−${bet}`) : bet}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
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
        <button
          type="button"
          onClick={() => {
            setBets(NONE);
            setFresh(false);
          }}
          disabled={busy || staked === 0}
          className="settings-btn h-[30px] px-3 text-[11.5px]"
        >
          {t("jhandi.clear")}
        </button>
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
      ) : (
        <button
          type="button"
          onClick={() => void roll()}
          disabled={busy || staked === 0}
          className="settings-btn settings-btn--accent h-10 w-full justify-center text-[13px]"
        >
          <Icon name="jhandi" className="size-4" />
          {t("jhandi.roll")}
        </button>
      )}
      <p className="text-center text-[10px] text-text-muted">{t("jhandi.pretend")}</p>

      {broke && !closed && (
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
