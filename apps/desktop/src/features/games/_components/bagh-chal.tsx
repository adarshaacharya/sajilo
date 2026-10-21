import { useState } from "react";
import type { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import type { BaghLevel } from "../../../types/api/BaghLevel";
import type { BaghPiece } from "../../../types/api/BaghPiece";
import type { BaghView } from "../../../types/api/BaghView";
import { useBagh } from "../games-data";
import { GameOver } from "./game-over";

type TFn = ReturnType<typeof useSettings>["t"];

const SIZE = 280;
const PAD = 22;
const STEP = (SIZE - PAD * 2) / 4;
const at = (point: number) => ({
  x: PAD + (point % 5) * STEP,
  y: PAD + Math.floor(point / 5) * STEP,
});

/** The board's lines: the grid, and the diagonals through the even points. */
const LINES: [number, number][] = [
  ...[0, 1, 2, 3, 4].map((i): [number, number] => [i * 5, i * 5 + 4]),
  ...[0, 1, 2, 3, 4].map((i): [number, number] => [i, 20 + i]),
  [0, 24],
  [4, 20],
  [2, 10],
  [2, 14],
  [10, 22],
  [14, 22],
];

const LEVELS: BaghLevel[] = ["easy", "medium", "hard"];
const LEVEL_KEYS = {
  easy: "sudoku.easy",
  medium: "sudoku.medium",
  hard: "sudoku.hard",
} as const satisfies Record<BaghLevel, string>;
const GLYPH: Record<BaghPiece, string> = { tiger: "🐯", goat: "🐐" };

/** बाघचाल against the computer, as goats or as tigers. */
export function BaghChal({ t }: { t: TFn }) {
  const { data, mutate } = useBagh();
  const [from, setFrom] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // The result popup over the final board, until it is folded; then the
  // setup to play again.
  const [closed, setClosed] = useState(false);
  if (!data) return null;
  const game = data.game;

  const apply = async (task: Promise<BaghView>) => {
    if (busy) return;
    setBusy(true);
    try {
      await mutate(await task, { revalidate: false });
      setFrom(null);
    } finally {
      setBusy(false);
    }
  };

  const startNew = (player: BaghPiece, level: BaghLevel) => {
    setClosed(false);
    void apply(api.baghNew(player, level));
  };
  if (!game || (game.outcome && closed)) {
    return <Start view={data} onStart={startNew} t={t} />;
  }
  const result = !game.outcome
    ? null
    : game.outcome === "draw"
      ? "draw"
      : (game.outcome === "goatsWin") === (game.player === "goat")
        ? "won"
        : "lost";
  const { stats } = data;

  const placing = game.moves.some((move) => move.from === null);
  const movable = new Set(game.moves.flatMap((move) => (move.from === null ? [] : [move.from])));
  const targets = new Set(
    game.moves
      .filter((move) => (placing ? move.from === null : move.from === from))
      .map((m) => m.to),
  );
  const tap = (point: number) => {
    if (busy) return;
    if (targets.has(point)) {
      void apply(api.baghPlay(placing ? null : from, point));
    } else if (movable.has(point)) {
      setFrom(point === from ? null : point);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-0.5 text-[11px] text-text-secondary">
        <span>
          {game.player === "goat"
            ? placing
              ? t("bagh.place").replace("{n}", String(game.goatsInHand))
              : t("bagh.move-goat")
            : t("bagh.move-tiger")}
        </span>
        <span className="tabular-nums">
          {t("bagh.captured").replace("{n}", String(game.captured))}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="bagh-board mx-auto block w-full max-w-[300px]"
        role="img"
        aria-label={t("bagh.title")}
      >
        {LINES.map(([a, b]) => {
          const p = at(a);
          const q = at(b);
          return (
            <line key={`${a}-${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="bagh-line" />
          );
        })}
        {game.points.map((piece, point) => {
          const { x, y } = at(point);
          const last = game.last && (game.last.to === point || game.last.from === point);
          return (
            // biome-ignore lint/a11y/useSemanticElements: an SVG point on the board
            <g
              // biome-ignore lint/suspicious/noArrayIndexKey: a point is its position
              key={point}
              role="button"
              tabIndex={targets.has(point) || movable.has(point) ? 0 : -1}
              onClick={() => tap(point)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") tap(point);
              }}
              className="cursor-pointer"
            >
              <circle cx={x} cy={y} r={STEP / 2.4} fill="transparent" />
              {targets.has(point) && <circle cx={x} cy={y} r={7} className="bagh-target" />}
              {piece && (
                <>
                  <circle
                    cx={x}
                    cy={y}
                    r={17}
                    className={`bagh-piece bagh-piece--${piece} ${from === point ? "bagh-piece--selected" : ""} ${last ? "bagh-piece--last" : ""}`}
                  />
                  <text x={x} y={y + 6} textAnchor="middle" fontSize="17">
                    {GLYPH[piece]}
                  </text>
                </>
              )}
              {!piece && last && <circle cx={x} cy={y} r={5} className="bagh-trail" />}
            </g>
          );
        })}
      </svg>

      <p className="px-0.5 text-center text-[10.5px] text-text-muted">
        {game.player === "goat" ? t("bagh.goal-goat") : t("bagh.goal-tiger")}
      </p>

      {result && (
        <GameOver
          result={result}
          title={t(result === "won" ? "bagh.won" : result === "draw" ? "bagh.draw" : "bagh.lost")}
          detail={t(LEVEL_KEYS[game.level])}
          stats={[
            { value: String(stats.wonAsGoats + stats.wonAsTigers), label: t("bagh.stat.won") },
            { value: `${stats.wonAsGoats}–${stats.lostAsGoats}`, label: t("bagh.stat.goats") },
            { value: `${stats.wonAsTigers}–${stats.lostAsTigers}`, label: t("bagh.stat.tigers") },
          ]}
          againLabel={t("bagh.again")}
          onAgain={() => startNew(game.player, game.level)}
          closeLabel={t("games.see-board")}
          onClose={() => setClosed(true)}
          busy={busy}
        />
      )}
    </div>
  );
}

function Start({
  view,
  onStart,
  t,
}: {
  view: BaghView;
  onStart: (player: BaghPiece, level: BaghLevel) => void;
  t: TFn;
}) {
  const [player, setPlayer] = useState<BaghPiece>(view.game?.player ?? "goat");
  const [level, setLevel] = useState<BaghLevel>(view.game?.level ?? "easy");
  const outcome = view.game?.outcome;
  const won =
    outcome &&
    ((outcome === "goatsWin" && view.game?.player === "goat") ||
      (outcome === "tigersWin" && view.game?.player === "tiger"));
  const { stats } = view;
  return (
    <div className="space-y-2.5">
      {outcome && (
        <section className="surface-card p-3 text-center">
          <p className="text-[24px]">{outcome === "draw" ? "🤝" : won ? "🎉" : "😅"}</p>
          <p className="text-[14px] font-semibold">
            {outcome === "draw" ? t("bagh.draw") : won ? t("bagh.won") : t("bagh.lost")}
          </p>
        </section>
      )}
      <section className="surface-card space-y-3 p-3">
        {!outcome && (
          <div>
            <p className="text-[14px] font-semibold">{t("bagh.title")}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">{t("bagh.rules")}</p>
          </div>
        )}
        <div className="space-y-1">
          <p className="text-[10.5px] text-text-muted">{t("bagh.play-as")}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(["goat", "tiger"] as const).map((side) => (
              <button
                key={side}
                type="button"
                aria-pressed={player === side}
                onClick={() => setPlayer(side)}
                className={`toggle-chip ${player === side ? "toggle-chip--on" : "toggle-chip--off"}`}
              >
                {GLYPH[side]} {t(side === "goat" ? "bagh.goats" : "bagh.tigers")}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[10.5px] text-text-muted">{t("bagh.level")}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {LEVELS.map((each, index) => (
              <button
                key={each}
                type="button"
                aria-pressed={level === each}
                onClick={() => setLevel(each)}
                className={`toggle-chip flex-col ${level === each ? "toggle-chip--on" : "toggle-chip--off"}`}
              >
                <span>{t(LEVEL_KEYS[each])}</span>
                {(stats.playedByLevel[index] ?? 0) > 0 && (
                  <span className="text-[9.5px] font-normal tabular-nums opacity-70">
                    {t("bagh.level-record")
                      .replace("{won}", String(stats.wonByLevel[index] ?? 0))
                      .replace("{played}", String(stats.playedByLevel[index] ?? 0))}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onStart(player, level)}
          className="settings-btn settings-btn--accent w-full justify-center"
        >
          {outcome ? t("bagh.again") : t("bagh.start")}
        </button>
      </section>
    </div>
  );
}
