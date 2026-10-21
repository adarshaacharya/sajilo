import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { useHeaderInner } from "../../shared/components/header-slot";
import { Icon, type IconName } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import { track } from "../../shared/lib/usage";
import { BaghChal } from "./_components/bagh-chal";
import { Katakuti } from "./_components/katakuti";
import { Quiz } from "./_components/quiz";
import { SaapSidhi } from "./_components/saap-sidhi";
import { Shabda } from "./_components/shabda";
import { Sudoku } from "./_components/sudoku";
import { useBagh, useKata, useQuiz, useSaap, useShabda, useSudoku } from "./games-data";

type Game = "shabda" | "quiz" | "sudoku" | "bagh" | "kata" | "saap";
const GAMES: Game[] = ["shabda", "quiz", "sudoku", "bagh", "kata", "saap"];
const TITLES = {
  shabda: "shabda.title",
  quiz: "quiz.title",
  sudoku: "sudoku.title",
  bagh: "bagh.title",
  kata: "kata.title",
  saap: "saap.title",
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
  if (open === "kata") return <Katakuti t={t} />;
  if (open === "saap") return <SaapSidhi t={t} />;

  return (
    <div className="space-y-2.5">
      <ShabdaCard onOpen={() => setOpen("shabda")} t={t} />
      <QuizCard onOpen={() => setOpen("quiz")} t={t} />
      <SudokuCard onOpen={() => setOpen("sudoku")} t={t} />
      <BaghCard onOpen={() => setOpen("bagh")} t={t} />
      <KataCard onOpen={() => setOpen("kata")} t={t} />
      <SaapCard onOpen={() => setOpen("saap")} t={t} />
      <p className="px-0.5 text-[10px] leading-relaxed text-text-muted">{t("games.note")}</p>
    </div>
  );
}

function ShabdaCard({ onOpen, t }: { onOpen: () => void; t: ReturnType<typeof useSettings>["t"] }) {
  const { data } = useShabda();
  const detail = !data
    ? t("shabda.card")
    : data.status === "playing"
      ? data.livesLeft < data.lives
        ? t("shabda.card-playing").replace("{n}", String(data.livesLeft))
        : t("shabda.card")
      : t("shabda.card-run").replace("{n}", String(data.stats.run));
  return <GameCard icon="wordGame" title={t("shabda.title")} detail={detail} onOpen={onOpen} />;
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

function KataCard({ onOpen, t }: { onOpen: () => void; t: ReturnType<typeof useSettings>["t"] }) {
  const { data } = useKata();
  const playing = data?.game && !data.game.outcome;
  return (
    <GameCard
      icon="katakuti"
      title={t("kata.title")}
      detail={playing ? t("kata.card-playing") : t("kata.card")}
      onOpen={onOpen}
    />
  );
}

function SaapCard({ onOpen, t }: { onOpen: () => void; t: ReturnType<typeof useSettings>["t"] }) {
  const { data } = useSaap();
  const playing = data?.game && !data.game.winner;
  return (
    <GameCard
      icon="saapSidhi"
      title={t("saap.title")}
      detail={playing ? t("saap.card-playing") : t("saap.card")}
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
