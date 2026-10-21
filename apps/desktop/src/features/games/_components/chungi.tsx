import { useCallback, useEffect, useRef, useState } from "react";
import type { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import type { ChungiMode } from "../../../types/api/ChungiMode";
import type { ChungiView } from "../../../types/api/ChungiView";
import { useChungi } from "../games-data";
import { GameOver } from "./game-over";

type TFn = ReturnType<typeof useSettings>["t"];

/** Where the kick zone sits, as a share of the scene's height from the top. */
const ZONE_Y = 0.82;
/** How fast the chungi falls at the start, in scene heights per second². */
const GRAVITY = 1.7;
/** Misses a run can take: an early kick or a drop costs one. */
const LIVES = 3;
/** After a miss the chungi waits at the top this long before it falls
 * again; taps meanwhile are ignored, so one mistake costs one life. */
const RESET_MS = 550;

/** Faster by 4.5% a kick, up to 30 kicks in. */
const gravity = (kicks: number) => GRAVITY * (1 + Math.min(kicks, 30) * 0.045);
/** Half the kick zone's height: it narrows a little with every kick. */
const zoneHalf = (kicks: number) => 0.085 - Math.min(kicks, 40) * 0.001;

/** Mulberry32: a small seeded generator, so the daily throws repeat. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let z = a;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  turn: number;
  kicks: number;
  perfect: number;
  lives: number;
  /** Until when (performance.now) it waits at the top after a miss. */
  heldUntil: number;
  random: () => number;
};

type Phase = "ready" | "playing" | "over";

/**
 * चुङ्गी: keep the rubber-band ball in the air. It falls; tap (or press
 * Space) as it passes through the glow by the foot to kick it back up. Too
 * early, or let it drop, and the run is over. It speeds up as you go, and a
 * kick right in the middle of the glow counts as perfect.
 */
export function Chungi({ t }: { t: TFn }) {
  const { data, mutate } = useChungi();
  const [mode, setMode] = useState<ChungiMode>("classic");
  const [phase, setPhase] = useState<Phase>("ready");
  const [kicks, setKicks] = useState(0);
  const [miss, setMiss] = useState<"early" | "drop" | null>(null);
  const [result, setResult] = useState<ChungiView | null>(null);
  const [closed, setClosed] = useState(false);
  const [perfectFlash, setPerfectFlash] = useState(0);
  const [lives, setLives] = useState(LIVES);
  // Bumped on each life lost, so the scene flashes red once each time.
  const [hit, setHit] = useState(0);

  const scene = useRef<HTMLDivElement>(null);
  const ballEl = useRef<HTMLDivElement>(null);
  const footEl = useRef<HTMLDivElement>(null);
  const zoneEl = useRef<HTMLDivElement>(null);
  const ball = useRef<Ball | null>(null);
  const runRef = useRef({ mode, phase });
  runRef.current = { mode, phase };

  const draw = useCallback(() => {
    const b = ball.current;
    if (!b) return;
    if (ballEl.current) {
      ballEl.current.style.left = `${b.x * 100}%`;
      ballEl.current.style.top = `${b.y * 100}%`;
      ballEl.current.style.transform = `translate(-50%, -50%) rotate(${b.turn}deg)`;
    }
    if (footEl.current) footEl.current.style.left = `${b.x * 100}%`;
    if (zoneEl.current) {
      const half = zoneHalf(b.kicks);
      zoneEl.current.style.top = `${(ZONE_Y - half) * 100}%`;
      zoneEl.current.style.height = `${half * 2 * 100}%`;
    }
  }, []);

  const finish = useCallback(
    async (why: "early" | "drop") => {
      const b = ball.current;
      setPhase("over");
      setMiss(why);
      setClosed(false);
      if (!b) return;
      const view = await api
        .chungiRecord(runRef.current.mode, b.kicks, b.perfect)
        .catch(() => null);
      if (view) {
        setResult(view);
        await mutate(view, { revalidate: false });
      }
    },
    [mutate],
  );

  const start = useCallback(() => {
    // The daily seed fits a plain number: the shell keeps it under 2^53.
    const seed = runRef.current.mode === "daily" ? Number(data?.dailySeed ?? 1) : Date.now();
    ball.current = {
      x: 0.5,
      y: 0.12,
      vx: 0,
      vy: 0,
      spin: 90,
      turn: 0,
      kicks: 0,
      perfect: 0,
      lives: LIVES,
      heldUntil: 0,
      random: seeded(seed % 4294967296),
    };
    setKicks(0);
    setPerfectFlash(0);
    setLives(LIVES);
    setHit(0);
    setMiss(null);
    setResult(null);
    setPhase("playing");
    draw();
  }, [data?.dailySeed, draw]);

  /** A miss, early or dropped: one life fewer, and the run ends with the
   * last. Either way the chungi starts again from the top after a pause, so
   * the same mistake can never cost a second life. */
  const lose = useCallback(
    (why: "early" | "drop") => {
      const b = ball.current;
      if (!b) return;
      b.lives -= 1;
      setLives(b.lives);
      setHit((n) => n + 1);
      if (b.lives <= 0) {
        void finish(why);
        return;
      }
      b.x = 0.5;
      b.y = 0.08;
      b.vx = 0;
      b.vy = 0;
      b.heldUntil = performance.now() + RESET_MS;
      draw();
    },
    [finish, draw],
  );

  const kick = useCallback(() => {
    const b = ball.current;
    if (!b || runRef.current.phase !== "playing") return;
    // A tap while it's still going up is ignored, not counted against you.
    if (b.vy < 0 || performance.now() < b.heldUntil) return;
    const half = zoneHalf(b.kicks);
    const off = Math.abs(b.y - ZONE_Y);
    if (off > half) {
      lose("early");
      return;
    }
    const perfect = off <= half * 0.3;
    b.kicks += 1;
    if (perfect) {
      b.perfect += 1;
      setPerfectFlash((n) => n + 1);
    }
    const apex = 0.1 + b.random() * 0.25;
    b.vy = -Math.sqrt(2 * gravity(b.kicks) * Math.max(b.y - apex, 0.2));
    b.vx = (b.random() - 0.5) * 0.36;
    b.spin = (b.random() - 0.5) * 720;
    setKicks(b.kicks);
    // Restart the foot's swing.
    const foot = footEl.current;
    if (foot) {
      foot.classList.remove("chungi-foot--kick");
      void foot.offsetWidth;
      foot.classList.add("chungi-foot--kick");
    }
  }, [lose]);

  // The loop: fall, drift, bounce off the walls; a drop costs a life.
  useEffect(() => {
    if (phase !== "playing") return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const b = ball.current;
      if (!b) return;
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      // Waiting at the top after a miss.
      if (now < b.heldUntil) {
        frame = requestAnimationFrame(step);
        return;
      }
      b.vy += gravity(b.kicks) * dt;
      b.y += b.vy * dt;
      b.x += b.vx * dt;
      if (b.x < 0.12 || b.x > 0.88) {
        b.vx = -b.vx;
        b.x = Math.min(Math.max(b.x, 0.12), 0.88);
      }
      b.turn += b.spin * dt;
      if (b.y > 1.02) {
        lose("drop");
        if (b.lives <= 0) return;
      }
      draw();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [phase, draw, lose]);

  // Space or Enter kicks; on the ready screen, starts.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " " && event.key !== "Enter") return;
      if (runRef.current.phase === "playing") {
        event.preventDefault();
        kick();
      } else if (runRef.current.phase === "ready") {
        event.preventDefault();
        start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kick, start]);

  if (!data) return null;
  const best = mode === "daily" ? data.dailyBest : data.stats.best;
  const sky = kicks >= 50 ? "night" : kicks >= 25 ? "evening" : "day";
  const newBest = result?.newBest ?? false;

  return (
    <div className="space-y-2.5">
      <div
        ref={scene}
        className={`chungi-scene chungi-scene--${sky}`}
        onPointerDown={(event) => {
          if (phase !== "playing") return;
          event.preventDefault();
          kick();
        }}
        role="application"
        aria-label={t("chungi.title")}
      >
        <svg
          viewBox="0 0 100 125"
          preserveAspectRatio="none"
          className="chungi-backdrop"
          aria-hidden="true"
        >
          <path
            d="M0 62 Q18 48 34 58 T70 52 T100 58 V125 H0 Z"
            className="chungi-hill chungi-hill--far"
          />
          <path d="M0 70 Q22 60 42 68 T100 66 V125 H0 Z" className="chungi-hill" />
        </svg>
        <div className="chungi-wall" />
        <div className="chungi-ground" />

        {/* What's left of the run's lives, in the corner. */}
        <div
          className="chungi-lives"
          role="img"
          aria-label={t("chungi.lives").replace("{n}", String(lives))}
        >
          {Array.from({ length: LIVES }, (_, life) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: one heart per life, fixed
              key={life}
              className={`chungi-heart ${life < lives ? "" : "chungi-heart--gone"}`}
            >
              ♥
            </span>
          ))}
        </div>
        {hit > 0 && phase === "playing" && (
          <span key={`hit${hit}`} className="chungi-hit" aria-hidden="true">
            −1 ♥
          </span>
        )}

        <div className="chungi-hud">
          <span className="chungi-hud__count">{kicks}</span>
          <span className="chungi-hud__best">
            {t("chungi.best")} {best}
          </span>
        </div>

        <div
          ref={zoneEl}
          className="chungi-zone"
          style={{ top: `${(ZONE_Y - 0.085) * 100}%`, height: "17%" }}
        />
        {perfectFlash > 0 && phase === "playing" && (
          <span key={perfectFlash} className="chungi-perfect">
            {t("chungi.perfect")}
          </span>
        )}

        <div ref={ballEl} className="chungi-ball" style={{ left: "50%", top: "12%" }}>
          <ChungiBall />
        </div>
        <div ref={footEl} className="chungi-foot" style={{ left: "50%" }}>
          <Chappal />
        </div>

        {phase === "ready" && (
          <div className="chungi-ready">
            <p className="text-[15px] font-semibold">{t("chungi.ready")}</p>
            <p className="mt-1 max-w-[230px] text-[11.5px] leading-snug opacity-80">
              {t("chungi.how")}
            </p>
            <div className="mt-3 flex gap-1.5">
              {data.modes.map((each) => (
                <button
                  key={each}
                  type="button"
                  aria-pressed={mode === each}
                  onClick={() => setMode(each)}
                  className={`chungi-mode ${mode === each ? "chungi-mode--on" : ""}`}
                >
                  {t(each === "daily" ? "chungi.daily" : "chungi.classic")}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={start}
              className="settings-btn settings-btn--accent mt-3 h-9 w-full max-w-[220px] justify-center text-[13px]"
            >
              {t("chungi.start")}
            </button>
          </div>
        )}
      </div>

      {phase === "over" && !closed && (
        <GameOver
          result={newBest ? "won" : "lost"}
          title={
            newBest
              ? t("chungi.new-best").replace("{n}", String(kicks))
              : t("chungi.kicks").replace("{n}", String(kicks))
          }
          detail={t(miss === "early" ? "chungi.early" : "chungi.drop")}
          stats={[
            { value: String(best), label: t("chungi.stat.best") },
            { value: String(ball.current?.perfect ?? 0), label: t("chungi.stat.perfect") },
            { value: String(data.stats.played), label: t("chungi.stat.played") },
          ]}
          againLabel={t("chungi.again")}
          onAgain={start}
          closeLabel={t("chungi.change-mode")}
          onClose={() => {
            setClosed(true);
            setPhase("ready");
          }}
        />
      )}
    </div>
  );
}

/** A bundle of coloured rubber bands, tied in the middle with a tuft. */
function ChungiBall() {
  return (
    <svg viewBox="0 0 40 40" className="size-full" aria-hidden="true">
      <ellipse cx="20" cy="20" rx="14" ry="9" fill="#ef6f5c" />
      <ellipse cx="20" cy="20" rx="9" ry="14" fill="#f6c945" />
      <ellipse cx="20" cy="20" rx="12" ry="11" transform="rotate(45 20 20)" fill="#5aa3e6" />
      <ellipse cx="20" cy="20" rx="12" ry="7" transform="rotate(-45 20 20)" fill="#62bf6e" />
      <circle cx="20" cy="20" r="4.5" fill="#a98be8" />
      <path
        d="M20 6 L17 1 M20 6 L23 1 M34 20 L39 17 M6 20 L1 23"
        stroke="#1d1a16"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle
        cx="20"
        cy="20"
        r="15.5"
        fill="none"
        stroke="#1d1a16"
        strokeWidth="1.6"
        opacity="0.7"
      />
    </svg>
  );
}

/** A foot in a चप्पल, toes up, ready to kick. */
function Chappal() {
  return (
    <svg viewBox="0 0 60 28" className="size-full" aria-hidden="true">
      <path
        d="M6 20 Q4 10 18 9 L40 8 Q56 8 56 17 Q56 24 44 24 L12 24 Q6 24 6 20 Z"
        fill="#c98b5a"
      />
      <path d="M4 25 L56 25 Q58 27 54 28 L8 28 Q2 28 4 25 Z" fill="#2f6fa8" />
      <path
        d="M30 9 Q36 18 44 9"
        fill="none"
        stroke="#2f6fa8"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
