import { useEffect, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import type { SudokuLevel } from "../../../types/api/SudokuLevel";
import type { SudokuView } from "../../../types/api/SudokuView";
import { useSudoku } from "../games-data";
import { GameOver } from "./game-over";

type TFn = ReturnType<typeof useSettings>["t"];

const N = 6;
const LEVELS: SudokuLevel[] = ["easy", "medium", "hard"];
const LEVEL_KEYS = {
  easy: "sudoku.easy",
  medium: "sudoku.medium",
  hard: "sudoku.hard",
} as const satisfies Record<SudokuLevel, string>;

/** The first square still to fill, or none. */
function firstEmpty(cells: number[]): number | null {
  const index = cells.indexOf(0);
  return index === -1 ? null : index;
}

/** "2:05" from seconds. */
function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Seconds since the puzzle began, ticking while it is unsolved. */
function useElapsed(startedAt: string | undefined, solvedIn: number | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (solvedIn != null || !startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, solvedIn]);
  if (solvedIn != null) return solvedIn;
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
}

/** Mini Sudoku: a 6×6 grid, digits 1–6 once in every row, column and box. */
export function Sudoku({ t }: { t: TFn }) {
  const { numerals } = useSettings();
  const { data, mutate } = useSudoku();
  const [selected, setSelected] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  // The solved popup, until "See board" folds it.
  const [closed, setClosed] = useState(false);
  const game = data?.game ?? null;
  const elapsed = useElapsed(game?.startedAt, game?.solvedIn);

  // A puzzle opens with its first empty square picked, so the number pad
  // works straight away; a new puzzle picks again.
  const startedAt = game?.startedAt;
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new puzzle (`startedAt`) re-picks; moves keep the player's square
  useEffect(() => {
    if (!game || game.solvedIn != null) return;
    setSelected((current) =>
      current !== null && game.givens[current] === 0 ? current : firstEmpty(game.cells),
    );
  }, [startedAt]);

  const apply = async (task: Promise<SudokuView>) => {
    setClosed(false);
    await mutate(await task, { revalidate: false });
  };
  const put = (digit: number) => {
    if (selected === null || !game || game.givens[selected] !== 0 || game.solvedIn != null) return;
    void apply(api.sudokuSet(selected, digit));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (selected === null) return;
      if (/^[1-6]$/.test(event.key)) put(Number(event.key));
      else if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") put(0);
      else if (event.key.startsWith("Arrow")) {
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -N, ArrowDown: N }[event.key] ?? 0;
        const next = selected + step;
        if (next >= 0 && next < N * N) setSelected(next);
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!data) return null;
  if (!game)
    return <Start view={data} onStart={(level) => void apply(api.sudokuNew(level))} t={t} />;

  const solved = game.solvedIn != null;
  // The picked square's row and column, lit lightly; its box already shows
  // by its shading.
  const peer = (a: number, b: number) => Math.floor(a / N) === Math.floor(b / N) || a % N === b % N;
  const selectedDigit = selected !== null ? game.cells[selected] : 0;
  const filled = game.cells.filter(Boolean).length;
  const clash = game.conflicts.some(Boolean);
  const pickedGiven = selected !== null && game.givens[selected] !== 0;
  /** What to do next, in a line under the board. */
  const guide = clash
    ? t("sudoku.guide.clash")
    : selected === null
      ? t("sudoku.guide.pick")
      : pickedGiven
        ? t("sudoku.guide.fixed")
        : t("sudoku.guide.number");

  return (
    <div className="space-y-2.5">
      <section className="surface-card px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-[11.5px] leading-snug text-text-secondary">
            {t("sudoku.rules-short").replace("{max}", digits(N, numerals))}
          </p>
          <button
            type="button"
            onClick={() => setHelp((open) => !open)}
            aria-expanded={help}
            className="flex shrink-0 items-center gap-1 text-[10.5px] text-text-muted transition-colors hover:text-text"
          >
            <Icon name="info" className="size-3" />
            {t("sudoku.how")}
          </button>
        </div>
        {help && (
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-[11px] leading-snug text-text-secondary">
            <li>{t("sudoku.help.1")}</li>
            <li>{t("sudoku.help.2")}</li>
            <li>{t("sudoku.help.3")}</li>
          </ol>
        )}
      </section>

      <div className="flex items-center justify-between px-0.5 text-[11px] text-text-muted">
        <span>
          {t(LEVEL_KEYS[game.level])} ·{" "}
          {t("sudoku.filled")
            .replace("{n}", digits(filled, numerals))
            .replace("{total}", digits(N * N, numerals))}
        </span>
        <span className="tabular-nums">{clock(elapsed)}</span>
      </div>

      <div className="sudoku-grid">
        {game.cells.map((value, cell) => {
          const given = game.givens[cell] !== 0;
          const row = Math.floor(cell / N);
          const col = cell % N;
          // The six 2×3 boxes, shaded in turn like a chessboard.
          const shaded = (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 1;
          const classes = [
            "sudoku-cell",
            shaded ? "sudoku-cell--shade" : "",
            given ? "sudoku-cell--given" : "sudoku-cell--mine",
            cell % N === 2 ? "sudoku-cell--box-right" : "",
            Math.floor(cell / N) % 2 === 1 && Math.floor(cell / N) < N - 1
              ? "sudoku-cell--box-bottom"
              : "",
            selected === cell ? "sudoku-cell--selected" : "",
            selected !== null && selected !== cell && peer(selected, cell)
              ? "sudoku-cell--peer"
              : "",
            selectedDigit !== 0 && value === selectedDigit && selected !== cell
              ? "sudoku-cell--same"
              : "",
            game.conflicts[cell] ? "sudoku-cell--conflict" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: a cell is its position
              key={cell}
              type="button"
              onClick={() => setSelected(cell)}
              className={classes}
              aria-label={`${Math.floor(cell / N) + 1},${(cell % N) + 1}`}
            >
              {value ? digits(value, numerals) : ""}
            </button>
          );
        })}
      </div>

      {solved && !closed && (
        <GameOver
          result="won"
          title={t("sudoku.solved-title")}
          detail={`${t("sudoku.solved").replace("{time}", clock(game.solvedIn ?? 0))} ${t(
            "sudoku.best",
          ).replace("{time}", clock(data.stats.bestSeconds[LEVELS.indexOf(game.level)] ?? 0))}`}
          stats={LEVELS.map((level, index) => ({
            value: String(data.stats.solved[index] ?? 0),
            label: t(LEVEL_KEYS[level]),
          }))}
          againLabel={t("sudoku.new")}
          onAgain={() => void apply(api.sudokuNew(game.level))}
          closeLabel={t("games.see-board")}
          onClose={() => setClosed(true)}
        />
      )}
      {solved ? (
        <section className="surface-card space-y-2.5 p-3">
          <div>
            <p className="text-[14px] font-semibold">
              {t("sudoku.solved").replace("{time}", clock(game.solvedIn ?? 0))}
            </p>
            <p className="mt-0.5 text-[11px] text-text-secondary">
              {t("sudoku.best").replace(
                "{time}",
                clock(data.stats.bestSeconds[LEVELS.indexOf(game.level)] ?? 0),
              )}
            </p>
          </div>
          <LevelButtons
            stats={data.stats}
            onStart={(level) => void apply(api.sudokuNew(level))}
            t={t}
          />
        </section>
      ) : (
        <>
          <p
            className={`px-0.5 text-center text-[11px] ${clash ? "text-holiday" : "text-text-muted"}`}
          >
            {guide}
          </p>
          <div className="grid grid-cols-7 gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((digit) => {
              const left = N - game.cells.filter((value) => value === digit).length;
              return (
                <button
                  key={digit}
                  type="button"
                  onClick={() => put(digit)}
                  disabled={selected === null || pickedGiven}
                  className={`sudoku-key ${left <= 0 ? "sudoku-key--done" : ""}`}
                >
                  <span>{digits(digit, numerals)}</span>
                  <span className="sudoku-key__left">
                    {left > 0 ? digits(left, numerals) : "✓"}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => put(0)}
              disabled={selected === null || pickedGiven}
              className="sudoku-key"
              aria-label={t("sudoku.erase")}
              title={t("sudoku.erase")}
            >
              <Icon name="close" className="size-3.5" />
            </button>
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void apply(api.sudokuNew(game.level))}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
            >
              <Icon name="refresh" className="size-3" />
              {t("sudoku.new")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Start({
  view,
  onStart,
  t,
}: {
  view: SudokuView;
  onStart: (level: SudokuLevel) => void;
  t: TFn;
}) {
  return (
    <section className="surface-card space-y-2.5 p-3">
      <div>
        <p className="text-[14px] font-semibold">{t("sudoku.title")}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">{t("sudoku.rules")}</p>
      </div>
      <LevelButtons stats={view.stats} onStart={onStart} t={t} />
    </section>
  );
}

/** A button a level, each with its record under the name: puzzles solved
 * and the best time, so the choice shows what there is to beat. */
function LevelButtons({
  stats,
  onStart,
  t,
}: {
  stats: SudokuView["stats"];
  onStart: (level: SudokuLevel) => void;
  t: TFn;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {LEVELS.map((level, index) => {
        const solved = stats.solved[index] ?? 0;
        const best = stats.bestSeconds[index] ?? 0;
        return (
          <button key={level} type="button" onClick={() => onStart(level)} className="game-level">
            <span className="text-[12.5px] font-semibold">{t(LEVEL_KEYS[level])}</span>
            <span className="text-[10px] text-text-muted tabular-nums">
              {solved > 0
                ? t("sudoku.level-record")
                    .replace("{n}", String(solved))
                    .replace("{time}", clock(best))
                : t("sudoku.level-new")}
            </span>
          </button>
        );
      })}
    </div>
  );
}
