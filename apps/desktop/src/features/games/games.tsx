import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { useHeaderInner } from "../../shared/components/header-slot";
import { Icon, type IconName } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import { track } from "../../shared/lib/usage";
import { BaghChal } from "./_components/bagh-chal";
import { Quiz } from "./_components/quiz";
import { Shabda } from "./_components/shabda";
import { Sudoku } from "./_components/sudoku";
import { useBagh, useQuiz, useShabda, useSudoku } from "./games-data";

type Game = "shabda" | "quiz" | "sudoku" | "bagh";
const GAMES: Game[] = ["shabda", "quiz", "sudoku", "bagh"];
const TITLES = {
  shabda: "shabda.title",
  quiz: "quiz.title",
  sudoku: "sudoku.title",
  bagh: "bagh.title",
} as const satisfies Record<Game, string>;

/**
 * Short games, each a few minutes: a break from the screen's other work,
 * never another thing asking for attention. Progress is kept as you go.
 */
export function Games() {
  const { t } = useSettings();
  const { search } = useLocation();
  const [open, setOpen] = useState<Game | null>(() => {
    const linked = new URLSearchParams(search).get("open");
    return GAMES.find((game) => game === linked) ?? null;
  });
  useEffect(() => {
    if (open) track(`tab.games.${open}`);
  }, [open]);
  useHeaderInner(open ? { title: t(TITLES[open]), onBack: () => setOpen(null) } : null);

  if (open === "shabda") return <Shabda t={t} />;
  if (open === "quiz") return <Quiz t={t} />;
  if (open === "sudoku") return <Sudoku t={t} />;
  if (open === "bagh") return <BaghChal t={t} />;

  return (
    <div className="space-y-2.5">
      <ShabdaCard onOpen={() => setOpen("shabda")} t={t} />
      <QuizCard onOpen={() => setOpen("quiz")} t={t} />
      <SudokuCard onOpen={() => setOpen("sudoku")} t={t} />
      <BaghCard onOpen={() => setOpen("bagh")} t={t} />
      <Progress t={t} />
      <p className="px-0.5 text-[10px] leading-relaxed text-text-muted">{t("games.note")}</p>
    </div>
  );
}

function ShabdaCard({ onOpen, t }: { onOpen: () => void; t: ReturnType<typeof useSettings>["t"] }) {
  const { data } = useShabda();
  const detail = !data
    ? t("shabda.card")
    : data.status === "won"
      ? t("shabda.card-won")
          .replace("{n}", String(data.rows.length))
          .replace("{streak}", String(data.stats.streak))
      : data.status === "lost"
        ? t("shabda.card-lost")
        : data.rows.length > 0
          ? t("shabda.card-playing").replace("{n}", String(data.rows.length))
          : t("shabda.card");
  return (
    <GameCard
      icon="wordGame"
      title={t("shabda.title")}
      badge={data ? `#${data.number}` : undefined}
      detail={detail}
      onOpen={onOpen}
    />
  );
}

function QuizCard({ onOpen, t }: { onOpen: () => void; t: ReturnType<typeof useSettings>["t"] }) {
  const { data } = useQuiz();
  const detail = data?.inRound
    ? t("quiz.card-playing")
    : data && data.stats.rounds > 0
      ? t("quiz.card-best").replace("{best}", String(data.stats.bestRound))
      : t("quiz.card");
  return <GameCard icon="quiz" title={t("quiz.title")} detail={detail} onOpen={onOpen} />;
}

function SudokuCard({ onOpen, t }: { onOpen: () => void; t: ReturnType<typeof useSettings>["t"] }) {
  const { data } = useSudoku();
  const playing = data?.game && data.game.solvedIn == null;
  const solved = data?.stats.solved.reduce((sum, n) => sum + n, 0) ?? 0;
  const detail = playing
    ? t("sudoku.card-playing")
    : solved > 0
      ? t("sudoku.record").replace("{n}", String(solved))
      : t("sudoku.card");
  return <GameCard icon="sudoku" title={t("sudoku.title")} detail={detail} onOpen={onOpen} />;
}

function BaghCard({ onOpen, t }: { onOpen: () => void; t: ReturnType<typeof useSettings>["t"] }) {
  const { data } = useBagh();
  const playing = data?.game && !data.game.outcome;
  return (
    <GameCard
      icon="baghChal"
      title={t("bagh.title")}
      detail={playing ? t("bagh.card-playing") : t("bagh.card")}
      onOpen={onOpen}
    />
  );
}

function GameCard({
  icon,
  title,
  badge,
  detail,
  onOpen,
}: {
  icon: IconName;
  title: string;
  badge?: string;
  detail: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="surface-card flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-surface-hover"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-[color:color-mix(in_srgb,var(--color-accent-mark)_14%,transparent)] text-accent-mark">
        <Icon name={icon} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-[14px] font-semibold">{title}</span>
          {badge && <span className="text-[10.5px] text-text-muted tabular-nums">{badge}</span>}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-text-secondary">{detail}</span>
      </span>
      <Icon name="chevronRight" className="size-3 shrink-0 text-text-muted" />
    </button>
  );
}

/** Every game's record in one place: kept on this computer, never sent. */
function Progress({ t }: { t: ReturnType<typeof useSettings>["t"] }) {
  const { data: shabda } = useShabda();
  const { data: quiz } = useQuiz();
  const { data: sudoku } = useSudoku();
  const { data: bagh } = useBagh();
  const pct = (part: number, whole: number) =>
    whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
  const quizSeen = quiz
    ? quiz.topics.reduce((sum, topic) => sum + topic.total - topic.unseen, 0)
    : 0;
  const quizTotal = quiz ? quiz.topics.reduce((sum, topic) => sum + topic.total, 0) : 0;
  const solved = sudoku?.stats.solved.reduce((sum, n) => sum + n, 0) ?? 0;
  const bestEasy = sudoku?.stats.bestSeconds[0] ?? 0;
  const baghWon = bagh ? bagh.stats.wonAsGoats + bagh.stats.wonAsTigers : 0;
  const baghPlayed = bagh
    ? baghWon + bagh.stats.lostAsGoats + bagh.stats.lostAsTigers + bagh.stats.draws
    : 0;
  const rows: { title: string; main: string; detail: string }[] = [
    {
      title: t("shabda.title"),
      main: t("progress.streak").replace("{n}", String(shabda?.stats.streak ?? 0)),
      detail: t("progress.shabda")
        .replace("{played}", String(shabda?.stats.played ?? 0))
        .replace("{won}", pct(shabda?.stats.won ?? 0, shabda?.stats.played ?? 0)),
    },
    {
      title: t("quiz.title"),
      main: pct(quiz?.stats.correct ?? 0, quiz?.stats.answered ?? 0),
      detail: t("progress.quiz")
        .replace("{seen}", String(quizSeen))
        .replace("{total}", String(quizTotal)),
    },
    {
      title: t("sudoku.title"),
      main: t("progress.solved").replace("{n}", String(solved)),
      detail:
        bestEasy > 0
          ? t("progress.sudoku").replace(
              "{time}",
              `${Math.floor(bestEasy / 60)}:${String(bestEasy % 60).padStart(2, "0")}`,
            )
          : t("progress.none"),
    },
    {
      title: t("bagh.title"),
      main: t("progress.won").replace("{n}", String(baghWon)),
      detail: t("progress.bagh").replace("{n}", String(baghPlayed)),
    },
  ];
  return (
    <section className="space-y-1.5" aria-label={t("progress.title")}>
      <p className="px-0.5 text-[11px] font-semibold text-text-secondary">{t("progress.title")}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {rows.map((row) => (
          <div key={row.title} className="surface-card px-3 py-2.5">
            <p className="truncate text-[10.5px] text-text-muted">{row.title}</p>
            <p className="mt-0.5 text-[16px] font-semibold tabular-nums">{row.main}</p>
            <p className="mt-0.5 truncate text-[10px] text-text-muted">{row.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
