import { useState } from "react";
import { Icon } from "../../../shared/components/icon";
import type { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import type { KataLevel } from "../../../types/api/KataLevel";
import type { KataMark } from "../../../types/api/KataMark";
import type { KataOutcome } from "../../../types/api/KataOutcome";
import type { KataView } from "../../../types/api/KataView";
import { useKata } from "../games-data";
import { StatTiles } from "./stat-tiles";

type TFn = ReturnType<typeof useSettings>["t"];

const LEVELS: KataLevel[] = ["easy", "medium", "hard"];
const LEVEL_KEYS = {
  easy: "sudoku.easy",
  medium: "sudoku.medium",
  hard: "sudoku.hard",
} as const satisfies Record<KataLevel, string>;

const OUTCOME_KEYS = {
  won: "kata.won",
  lost: "kata.lost",
  draw: "kata.draw",
} as const satisfies Record<KataOutcome, string>;

/** How long the computer seems to think: long enough to see your own move
 * land before its answer does. */
const THINK_MS = 420;

/**
 * काटाकुटी: tic-tac-toe against the computer. X opens, and who is X takes
 * turns game by game. A round is over in seconds, so the next one is a tap
 * away from the result.
 */
export function Katakuti({ t }: { t: TFn }) {
  const { data, mutate } = useKata();
  const [pending, setPending] = useState<number | null>(null);
  const [level, setLevel] = useState<KataLevel | null>(null);

  if (!data) return null;
  const game = data.game;
  const chosen = level ?? game?.level ?? "medium";

  const start = async (next: KataLevel) => {
    setLevel(next);
    await mutate(await api.kataNew(next), { revalidate: false });
  };
  const play = async (cell: number) => {
    if (!game?.yourTurn || pending !== null || game.cells[cell]) return;
    setPending(cell);
    const began = Date.now();
    try {
      const next = await api.kataPlay(cell);
      const wait = THINK_MS - (Date.now() - began);
      if (wait > 0) await new Promise((done) => setTimeout(done, wait));
      await mutate(next, { revalidate: false });
    } finally {
      setPending(null);
    }
  };

  if (!game) return <Start view={data} level={chosen} onLevel={setLevel} onStart={start} t={t} />;

  const over = game.outcome != null;
  const cells = game.cells.map((mark, cell) => (cell === pending ? game.player : mark));
  const status = game.outcome
    ? t(OUTCOME_KEYS[game.outcome])
    : pending !== null
      ? t("kata.thinking")
      : t("kata.your-turn").replace("{mark}", game.player === "x" ? "X" : "O");

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-0.5 text-[11px] text-text-muted">
        <span>{t(LEVEL_KEYS[game.level])}</span>
        <span className={over ? `kata-status kata-status--${game.outcome}` : "kata-status"}>
          {status}
        </span>
      </div>

      <div className="kata-board">
        {cells.map((mark, cell) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: a cell is its place
            key={cell}
            type="button"
            onClick={() => void play(cell)}
            disabled={over || !game.yourTurn || pending !== null || mark !== null}
            aria-label={`${Math.floor(cell / 3) + 1},${(cell % 3) + 1}`}
            className={`kata-cell ${game.line?.includes(cell) ? "kata-cell--line" : ""} ${
              cell === game.last && !over ? "kata-cell--last" : ""
            }`}
          >
            {mark && <Mark mark={mark} />}
          </button>
        ))}
        {game.line && <Strike line={game.line} />}
      </div>

      {over ? (
        <section className="surface-card space-y-2.5 p-3">
          <LevelChips level={chosen} onLevel={setLevel} t={t} />
          <button
            type="button"
            onClick={() => void start(chosen)}
            className="settings-btn settings-btn--accent w-full justify-center"
          >
            <Icon name="refresh" className="size-3" />
            {t("kata.again")}
          </button>
          <p className="text-center text-[10.5px] text-text-muted">
            {t(data.computerStarts ? "kata.next-computer" : "kata.next-you")}
          </p>
        </section>
      ) : (
        <p className="px-0.5 text-center text-[10.5px] text-text-muted">{t("kata.rule")}</p>
      )}
    </div>
  );
}

/** X as two strokes, O as a ring, each in its own glowing colour. */
function Mark({ mark }: { mark: KataMark }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={`kata-mark kata-mark--${mark}`}
      aria-label={mark.toUpperCase()}
    >
      {mark === "x" ? <path d="M10 10 L30 30 M30 10 L10 30" /> : <circle cx="20" cy="20" r="11" />}
    </svg>
  );
}

/** The line through the winning three, from the first cell's centre to the
 * last's, drawn over the board. */
function Strike({ line }: { line: number[] }) {
  const centre = (cell: number) => [((cell % 3) + 0.5) * 100, (Math.floor(cell / 3) + 0.5) * 100];
  const [x1, y1] = centre(line[0] ?? 0);
  const [x2, y2] = centre(line[2] ?? 0);
  return (
    <svg viewBox="0 0 300 300" className="kata-strike" aria-hidden="true">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
    </svg>
  );
}

function LevelChips({
  level,
  onLevel,
  t,
}: {
  level: KataLevel;
  onLevel: (level: KataLevel) => void;
  t: TFn;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {LEVELS.map((each) => (
        <button
          key={each}
          type="button"
          aria-pressed={level === each}
          onClick={() => onLevel(each)}
          className={`toggle-chip ${level === each ? "toggle-chip--on" : "toggle-chip--off"}`}
        >
          {t(LEVEL_KEYS[each])}
        </button>
      ))}
    </div>
  );
}

function Start({
  view,
  level,
  onLevel,
  onStart,
  t,
}: {
  view: KataView;
  level: KataLevel;
  onLevel: (level: KataLevel) => void;
  onStart: (level: KataLevel) => Promise<void>;
  t: TFn;
}) {
  const sum = (list: number[]) => list.reduce((total, n) => total + n, 0);
  const { stats } = view;
  const played = sum(stats.won) + sum(stats.drawn) + sum(stats.lost);
  return (
    <div className="space-y-2.5">
      {played > 0 && (
        <StatTiles
          stats={[
            { value: String(sum(stats.won)), label: t("kata.stat.won") },
            { value: String(sum(stats.drawn)), label: t("kata.stat.drawn") },
            { value: String(sum(stats.lost)), label: t("kata.stat.lost") },
          ]}
        />
      )}
      <section className="surface-card space-y-3 p-3">
        <div>
          <p className="text-[14px] font-semibold">{t("kata.title")}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">{t("kata.rules")}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10.5px] text-text-muted">{t("bagh.level")}</p>
          <LevelChips level={level} onLevel={onLevel} t={t} />
        </div>
        <button
          type="button"
          onClick={() => void onStart(level)}
          className="settings-btn settings-btn--accent w-full justify-center"
        >
          {t("kata.start")}
        </button>
        <p className="text-center text-[10.5px] text-text-muted">
          {t(view.computerStarts ? "kata.next-computer" : "kata.next-you")}
        </p>
      </section>
    </div>
  );
}
