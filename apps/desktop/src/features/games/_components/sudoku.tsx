import { useEffect, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import type { SudokuLevel } from "../../../types/api/SudokuLevel";
import type { SudokuView } from "../../../types/api/SudokuView";
import { useSudoku } from "../games-data";

type TFn = ReturnType<typeof useSettings>["t"];

const N = 6;
const LEVELS: SudokuLevel[] = ["easy", "medium", "hard"];
const LEVEL_KEYS = {
  easy: "sudoku.easy",
  medium: "sudoku.medium",
  hard: "sudoku.hard",
} as const satisfies Record<SudokuLevel, string>;

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
  const game = data?.game ?? null;
  const elapsed = useElapsed(game?.startedAt, game?.solvedIn);

  const apply = async (task: Promise<SudokuView>) => {
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
  const peer = (a: number, b: number) =>
    Math.floor(a / N) === Math.floor(b / N) ||
    a % N === b % N ||
    (Math.floor(a / 12) === Math.floor(b / 12) &&
      Math.floor((a % N) / 3) === Math.floor((b % N) / 3));
  const selectedDigit = selected !== null ? game.cells[selected] : 0;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-0.5 text-[11px] text-text-muted">
        <span>{t(LEVEL_KEYS[game.level])}</span>
        <span className="tabular-nums">{clock(elapsed)}</span>
      </div>

      <div className="sudoku-grid">
        {game.cells.map((value, cell) => {
          const given = game.givens[cell] !== 0;
          const classes = [
            "sudoku-cell",
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
          <LevelButtons onStart={(level) => void apply(api.sudokuNew(level))} t={t} />
        </section>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => put(digit)}
                disabled={selected === null}
                className="sudoku-key"
              >
                {digits(digit, numerals)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => put(0)}
              disabled={selected === null}
              className="sudoku-key"
              aria-label={t("sudoku.erase")}
            >
              <Icon name="close" className="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void apply(api.sudokuNew(game.level))}
            className="px-0.5 text-[11px] text-text-muted hover:text-text-secondary"
          >
            {t("sudoku.new")}
          </button>
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
  const solved = view.stats.solved.reduce((sum, n) => sum + n, 0);
  return (
    <section className="surface-card space-y-2.5 p-3">
      <div>
        <p className="text-[14px] font-semibold">{t("sudoku.title")}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">{t("sudoku.rules")}</p>
      </div>
      <LevelButtons onStart={onStart} t={t} />
      {solved > 0 && (
        <p className="text-[10.5px] text-text-muted">
          {t("sudoku.record").replace("{n}", String(solved))}
        </p>
      )}
    </section>
  );
}

function LevelButtons({ onStart, t }: { onStart: (level: SudokuLevel) => void; t: TFn }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onStart(level)}
          className="settings-btn justify-center"
        >
          {t(LEVEL_KEYS[level])}
        </button>
      ))}
    </div>
  );
}
