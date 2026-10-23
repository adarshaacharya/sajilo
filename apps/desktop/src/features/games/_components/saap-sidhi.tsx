import { useEffect, useRef, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import type { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import type { SaapJump } from "../../../types/api/SaapJump";
import type { SaapMove } from "../../../types/api/SaapMove";
import type { SaapView } from "../../../types/api/SaapView";
import { useOverOnOpen } from "../_lib/use-over-on-open";
import { useSaap } from "../games-data";
import { GameOver } from "./game-over";

type TFn = ReturnType<typeof useSettings>["t"];

/** How long each part of a move takes to show, in ms: unhurried enough to
 * follow each hop, and a clear pause before the other side moves. */
const ROLL_MS = 650;
/** The die shows a new face this often while it rolls. */
const FLICK_MS = 80;
const HOP_MS = 240;
const BEFORE_JUMP_MS = 320;
const JUMP_MS = 850;
const BETWEEN_MS = 700;

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** A square's centre on the 100×100 board drawing. Square 1 is bottom left;
 * rows turn at each end, so 11 sits above 10. */
function centre(square: number): [number, number] {
  const index = Math.max(square, 1) - 1;
  const row = Math.floor(index / 10);
  const col = row % 2 === 0 ? index % 10 : 9 - (index % 10);
  return [(col + 0.5) * 10, (9 - row + 0.5) * 10];
}

/**
 * साँप-सिँढी: snakes and ladders against the computer. Tap the die; your
 * piece hops square by square, a ladder lifts it and a snake slides it
 * down, then the computer takes its turn. A six rolls again, and home needs
 * the exact number.
 */
export function SaapSidhi({ t }: { t: TFn }) {
  const { data, mutate } = useSaap();
  const [shown, setShown] = useState<{ you: number; computer: number } | null>(null);
  const [face, setFace] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [line, setLine] = useState("");
  const [busy, setBusy] = useState(false);
  // A ladder or snake glides; a hop snaps square to square.
  const [glide, setGlide] = useState(false);
  // Whose move is playing out, to light their side of the bar.
  const [mover, setMover] = useState<"you" | "computer" | null>(null);
  // The result popup, until "See board" folds it.
  const [closed, setClosed] = useState(false);
  // Whether the screen is still open, so a replay stops if it closes. Set
  // on every mount: React may mount, unmount and mount again.
  const { overOnOpen, forget } = useOverOnOpen(data ? data.game?.winner != null : undefined);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const game = data?.game ?? null;
  const pos = shown ?? { you: game?.you ?? 0, computer: game?.computer ?? 0 };

  /** Replays `moves` on the board, then settles on `view`. */
  const replay = async (view: SaapView, start: { you: number; computer: number }) => {
    let at = { ...start };
    setShown(at);
    for (const move of view.moves) {
      if (!alive.current) return;
      setMover(move.side);
      // The die flicks through faces, then lands on the roll.
      setRolling(true);
      const flick = window.setInterval(
        // A different face each flick, always 1 to 6.
        () => setFace((last) => ((last + Math.floor(Math.random() * 4)) % 6) + 1),
        FLICK_MS,
      );
      await wait(ROLL_MS);
      window.clearInterval(flick);
      setRolling(false);
      setFace(move.roll);
      await wait(200);
      setLine(describe(move, t));
      const key = move.side === "you" ? "you" : "computer";
      for (
        let square = move.from + 1;
        square <= move.landed && move.landed !== move.from;
        square++
      ) {
        at = { ...at, [key]: square };
        setShown(at);
        await wait(HOP_MS);
      }
      if (move.to !== move.landed) {
        await wait(BEFORE_JUMP_MS);
        setGlide(true);
        at = { ...at, [key]: move.to };
        setShown(at);
        await wait(JUMP_MS);
        setGlide(false);
      }
      await wait(BETWEEN_MS);
    }
    await mutate({ ...view, moves: [] }, { revalidate: false });
    setShown(null);
    setMover(null);
  };

  const run = async (task: () => Promise<SaapView>, start: { you: number; computer: number }) => {
    if (busy) return;
    setBusy(true);
    try {
      await replay(await task(), start);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;
  const roll = () => void run(() => api.saapRoll(), pos);
  const begin = () => {
    forget();
    setClosed(false);
    void run(() => api.saapNew(), { you: 0, computer: 0 });
  };

  if (!game || overOnOpen) return <Start view={data} onStart={begin} busy={busy} t={t} />;

  const over = game.winner != null && !busy;
  const status = over
    ? t(game.winner === "you" ? "saap.won" : "saap.lost")
    : line || t(game.yourTurn ? "saap.your-turn" : "saap.computer-turn");

  return (
    <div className="space-y-2.5">
      <Board
        ladders={data.ladders}
        snakes={data.snakes}
        you={pos.you}
        computer={pos.computer}
        glide={glide}
      />

      {/* You on the left, the die in the middle, the computer on the right;
          whoever is moving is lit. */}
      <div className="saap-bar">
        <Player
          side="you"
          label={t("saap.you")}
          square={pos.you}
          active={!over && (mover ?? (game.yourTurn ? "you" : "computer")) === "you"}
        />
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={roll}
            disabled={busy || !game.yourTurn}
            className={`saap-die ${rolling ? "saap-die--rolling" : ""} ${
              game.yourTurn && !busy ? "saap-die--ready" : ""
            }`}
            aria-label={t("saap.roll")}
          >
            <Pips value={face} />
          </button>
        </div>
        <Player
          side="computer"
          label={t("saap.computer")}
          square={pos.computer}
          active={!over && (mover ?? (game.yourTurn ? "you" : "computer")) === "computer"}
        />
      </div>
      <p
        className={`px-1 text-center text-[12px] font-semibold leading-snug ${
          over ? (game.winner === "you" ? "text-positive" : "text-holiday") : ""
        }`}
      >
        {status}
      </p>

      {over && !closed && (
        <GameOver
          result={game.winner === "you" ? "won" : "lost"}
          title={t(game.winner === "you" ? "saap.won" : "saap.lost")}
          detail={t("saap.final")
            .replace("{you}", String(pos.you))
            .replace("{computer}", String(pos.computer))}
          stats={[
            { value: String(data.stats.won), label: t("saap.stat.won") },
            { value: String(data.stats.lost), label: t("saap.stat.lost") },
            { value: String(data.stats.ladders), label: t("saap.stat.ladders") },
            { value: String(data.stats.snakes), label: t("saap.stat.snakes") },
          ]}
          againLabel={t("saap.again")}
          onAgain={begin}
          closeLabel={t("games.see-board")}
          onClose={() => setClosed(true)}
        />
      )}
      {over && (
        <section className="surface-card space-y-2.5 p-3">
          <button
            type="button"
            onClick={begin}
            className="settings-btn settings-btn--accent w-full justify-center"
          >
            <Icon name="refresh" className="size-3" />
            {t("saap.again")}
          </button>
          <p className="text-center text-[10.5px] text-text-muted">
            {t(data.computerStarts ? "saap.next-computer" : "saap.next-you")}
          </p>
        </section>
      )}
    </div>
  );
}

/** One side of the bar: the piece's colour, who it is, and its square. */
function Player({
  side,
  label,
  square,
  active,
}: {
  side: "you" | "computer";
  label: string;
  square: number;
  active: boolean;
}) {
  return (
    <div className={`saap-player ${active ? "saap-player--active" : ""}`}>
      <span className={`saap-dot saap-dot--${side}`} />
      <span className="min-w-0">
        <span className="block truncate text-[10.5px] text-text-muted">{label}</span>
        <span className="block text-[16px] font-semibold tabular-nums leading-tight">
          {square || "–"}
        </span>
      </span>
    </div>
  );
}

/** What a move did, in one line. */
function describe(move: SaapMove, t: TFn): string {
  const who = t(move.side === "you" ? "saap.you-rolled" : "saap.computer-rolled").replace(
    "{n}",
    String(move.roll),
  );
  const what =
    move.landed === move.from
      ? t("saap.exact")
      : move.to > move.landed
        ? t("saap.ladder").replace("{n}", String(move.to))
        : move.to < move.landed
          ? t("saap.snake").replace("{n}", String(move.to))
          : move.roll === 6 && move.to !== 100
            ? t("saap.again-six")
            : "";
  return what ? `${who} · ${what}` : who;
}

/** The 10×10 board, its ladders and snakes, and both pieces. */
function Board({
  ladders,
  snakes,
  you,
  computer,
  glide,
}: {
  ladders: SaapJump[];
  snakes: SaapJump[];
  you: number;
  computer: number;
  glide: boolean;
}) {
  // Rows from the top: 100 to 91 first, square 1 last.
  const squares = Array.from({ length: 100 }, (_, index) => {
    const row = 9 - Math.floor(index / 10);
    const col = index % 10;
    return row % 2 === 0 ? row * 10 + col + 1 : row * 10 + (9 - col) + 1;
  });
  const shared = you > 0 && you === computer;
  return (
    <div className={`saap-board ${glide ? "saap-board--glide" : ""}`}>
      {squares.map((square) => {
        const index = square - 1;
        const tint = (Math.floor(index / 10) + index) % 4;
        return (
          <div
            key={square}
            className={`saap-square saap-square--${tint} ${square === 100 ? "saap-square--home" : ""}`}
          >
            <span>{square === 100 ? "🏠" : square}</span>
          </div>
        );
      })}
      <svg viewBox="0 0 100 100" className="saap-art" aria-hidden="true">
        {ladders.map((jump) => (
          <Ladder key={`l${jump.from}`} jump={jump} />
        ))}
        {snakes.map((jump, index) => (
          <Snake key={`s${jump.from}`} jump={jump} tone={index % 3} />
        ))}
      </svg>
      {computer > 0 && <Piece square={computer} side="computer" nudge={shared ? 1 : 0} />}
      {you > 0 && <Piece square={you} side="you" nudge={shared ? -1 : 0} />}
    </div>
  );
}

function Piece({
  square,
  side,
  nudge,
}: {
  square: number;
  side: "you" | "computer";
  nudge: number;
}) {
  const [x, y] = centre(square);
  return (
    <span
      className={`saap-piece saap-piece--${side}`}
      style={{ left: `${x + nudge * 2.2}%`, top: `${y - nudge * 1.2}%` }}
    />
  );
}

/** Two rails from foot to top, with a rung every few units. */
function Ladder({ jump }: { jump: SaapJump }) {
  const [x1, y1] = centre(jump.from);
  const [x2, y2] = centre(jump.to);
  const length = Math.hypot(x2 - x1, y2 - y1);
  const [nx, ny] = [-(y2 - y1) / length, (x2 - x1) / length];
  const w = 1.9;
  const rungs = Math.max(2, Math.floor(length / 4.2));
  const lines: [number, number, number, number][] = [
    [x1 + nx * w, y1 + ny * w, x2 + nx * w, y2 + ny * w],
    [x1 - nx * w, y1 - ny * w, x2 - nx * w, y2 - ny * w],
    ...Array.from({ length: rungs }, (_, i): [number, number, number, number] => {
      const f = (i + 0.5) / rungs;
      const [cx, cy] = [x1 + (x2 - x1) * f, y1 + (y2 - y1) * f];
      return [cx + nx * w, cy + ny * w, cx - nx * w, cy - ny * w];
    }),
  ];
  // Drawn twice: a dark edge under a light rail, so it reads on any tile.
  return (
    <g className="saap-ladder">
      {["saap-ladder__edge", "saap-ladder__rail"].map((layer) => (
        <g key={layer} className={layer}>
          {lines.map(([ax, ay, bx, by]) => (
            <line key={`${ax}.${ay}`} x1={ax} y1={ay} x2={bx} y2={by} />
          ))}
        </g>
      ))}
    </g>
  );
}

/** A wavy body from head to tail, the head a little round blob. */
function Snake({ jump, tone }: { jump: SaapJump; tone: number }) {
  const [x1, y1] = centre(jump.from);
  const [x2, y2] = centre(jump.to);
  const length = Math.hypot(x2 - x1, y2 - y1);
  const [nx, ny] = [-(y2 - y1) / length, (x2 - x1) / length];
  const bend = Math.min(7, length / 4);
  const at = (f: number, side: number) => [
    x1 + (x2 - x1) * f + nx * bend * side,
    y1 + (y2 - y1) * f + ny * bend * side,
  ];
  const [ax, ay] = at(0.3, 1);
  const [bx, by] = at(0.7, -1);
  const body = `M${x1} ${y1} C${ax} ${ay} ${bx} ${by} ${x2} ${y2}`;
  // Eyes sit either side of the head, across the body's direction.
  const [ex, ey] = [nx * 1, ny * 1];
  return (
    <g className={`saap-snake saap-snake--${tone}`}>
      <path d={body} className="saap-snake__outline" />
      <path d={body} className="saap-snake__body" />
      <circle cx={x1} cy={y1} r={2.6} className="saap-snake__head" />
      <circle cx={x1 + ex} cy={y1 + ey} r={0.55} className="saap-snake__eye" />
      <circle cx={x1 - ex} cy={y1 - ey} r={0.55} className="saap-snake__eye" />
    </g>
  );
}

/** A die face: pips in their usual places. */
function Pips({ value }: { value: number }) {
  const spots: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [
      [28, 28],
      [72, 72],
    ],
    3: [
      [28, 28],
      [50, 50],
      [72, 72],
    ],
    4: [
      [28, 28],
      [72, 28],
      [28, 72],
      [72, 72],
    ],
    5: [
      [28, 28],
      [72, 28],
      [50, 50],
      [28, 72],
      [72, 72],
    ],
    6: [
      [28, 26],
      [72, 26],
      [28, 50],
      [72, 50],
      [28, 74],
      [72, 74],
    ],
  };
  return (
    <svg viewBox="0 0 100 100" className="size-full" aria-hidden="true">
      {(spots[value] ?? spots[1] ?? []).map(([cx, cy]) => (
        <circle key={`${cx}.${cy}`} cx={cx} cy={cy} r={9} />
      ))}
    </svg>
  );
}

function Start({
  view,
  onStart,
  busy,
  t,
}: {
  view: SaapView;
  onStart: () => void;
  busy: boolean;
  t: TFn;
}) {
  return (
    <div className="space-y-2.5">
      <section className="surface-card space-y-3 p-3">
        <div>
          <p className="text-[14px] font-semibold">{t("saap.title")}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">{t("saap.rules")}</p>
        </div>
        <button
          type="button"
          onClick={onStart}
          disabled={busy}
          className="settings-btn settings-btn--accent w-full justify-center"
        >
          {t("saap.start")}
        </button>
        <p className="text-center text-[10.5px] text-text-muted">
          {t(view.computerStarts ? "saap.next-computer" : "saap.next-you")}
        </p>
      </section>
    </div>
  );
}
