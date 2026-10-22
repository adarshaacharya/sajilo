import { Icon, type IconName } from "../../../shared/components/icon";
import type { useSettings } from "../../../shared/context/settings-context";
import {
  useBagh,
  useChungi,
  useJhandi,
  useKata,
  useQuiz,
  useSaap,
  useShabda,
  useSudoku,
} from "../games-data";
import { StatTiles } from "./stat-tiles";

type TFn = ReturnType<typeof useSettings>["t"];

export type Game = "shabda" | "quiz" | "sudoku" | "bagh" | "kata" | "saap" | "chungi" | "jhandi";

type Stat = { value: string; label: string };

const sum = (list: number[]) => list.reduce((total, n) => total + n, 0);
const pct = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
const clock = (seconds: number) =>
  seconds > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "—";

/** Each game's record as its start screen shows it, and whether a game is
 * under way to carry on with. Every hook runs, so the order never changes. */
function useLobbyData(game: Game, t: TFn): { stats: Stat[]; played: boolean; underway: boolean } {
  const kata = useKata().data;
  const saap = useSaap().data;
  const quiz = useQuiz().data;
  const shabda = useShabda().data;
  const sudoku = useSudoku().data;
  const bagh = useBagh().data;
  const chungi = useChungi().data;
  const jhandi = useJhandi().data;

  switch (game) {
    case "kata": {
      const stats = kata?.stats;
      const won = sum(stats?.won ?? []);
      const drawn = sum(stats?.drawn ?? []);
      const lost = sum(stats?.lost ?? []);
      return {
        stats: [
          { value: String(won), label: t("kata.stat.won") },
          { value: String(drawn), label: t("kata.stat.drawn") },
          { value: String(lost), label: t("kata.stat.lost") },
        ],
        played: won + drawn + lost > 0,
        underway: Boolean(kata?.game && !kata.game.outcome),
      };
    }
    case "saap": {
      const stats = saap?.stats;
      return {
        stats: [
          { value: String(stats?.won ?? 0), label: t("saap.stat.won") },
          { value: String(stats?.lost ?? 0), label: t("saap.stat.lost") },
          { value: String(stats?.ladders ?? 0), label: t("saap.stat.ladders") },
          { value: String(stats?.snakes ?? 0), label: t("saap.stat.snakes") },
        ],
        played: (stats?.won ?? 0) + (stats?.lost ?? 0) > 0,
        underway: Boolean(saap?.game && !saap.game.winner),
      };
    }
    case "quiz": {
      const stats = quiz?.stats;
      const seen =
        quiz?.topics.reduce((total, topic) => total + topic.total - topic.unseen, 0) ?? 0;
      const total = quiz?.topics.reduce((all, topic) => all + topic.total, 0) ?? 0;
      return {
        stats: [
          { value: pct(stats?.correct ?? 0, stats?.answered ?? 0), label: t("quiz.stat.right") },
          { value: `${seen}/${total}`, label: t("quiz.stat.seen") },
          { value: `${stats?.bestRound ?? 0}/10`, label: t("quiz.stat.best") },
        ],
        played: (stats?.answered ?? 0) > 0,
        underway: Boolean(quiz?.inRound),
      };
    }
    case "shabda": {
      const stats = shabda?.stats;
      return {
        stats: [
          { value: String(stats?.played ?? 0), label: t("shabda.stat.played") },
          { value: pct(stats?.won ?? 0, stats?.played ?? 0), label: t("shabda.stat.won") },
          { value: String(stats?.run ?? 0), label: t("shabda.stat.run") },
          { value: String(stats?.bestRun ?? 0), label: t("shabda.stat.best") },
        ],
        played: (stats?.played ?? 0) > 0,
        underway: Boolean(shabda && shabda.status === "playing" && shabda.livesLeft < shabda.lives),
      };
    }
    case "sudoku": {
      const stats = sudoku?.stats;
      return {
        stats: [
          { value: String(stats?.solved[0] ?? 0), label: t("sudoku.easy") },
          { value: String(stats?.solved[1] ?? 0), label: t("sudoku.medium") },
          { value: String(stats?.solved[2] ?? 0), label: t("sudoku.hard") },
          { value: clock(stats?.bestSeconds[0] ?? 0), label: t("lobby.best-easy") },
        ],
        played: sum(stats?.solved ?? []) > 0,
        underway: Boolean(sudoku?.game && sudoku.game.solvedIn == null),
      };
    }
    case "chungi": {
      const stats = chungi?.stats;
      return {
        stats: [
          { value: String(stats?.best ?? 0), label: t("chungi.stat.best") },
          { value: String(chungi?.dailyBest ?? 0), label: t("chungi.stat.today") },
          { value: String(stats?.perfect ?? 0), label: t("chungi.stat.perfect") },
          { value: String(stats?.played ?? 0), label: t("chungi.stat.played") },
        ],
        played: (stats?.played ?? 0) > 0,
        underway: false,
      };
    }
    case "jhandi": {
      const stats = jhandi?.stats;
      return {
        stats: [
          { value: String(jhandi?.purse ?? 0), label: t("jhandi.stat.purse") },
          { value: String(stats?.bestPurse ?? 0), label: t("jhandi.stat.best") },
          { value: String(stats?.biggestWin ?? 0), label: t("jhandi.stat.biggest") },
          { value: String(stats?.rounds ?? 0), label: t("jhandi.stat.rounds") },
        ],
        played: (stats?.rounds ?? 0) > 0,
        underway: false,
      };
    }
    case "bagh": {
      const stats = bagh?.stats;
      const won = (stats?.wonAsGoats ?? 0) + (stats?.wonAsTigers ?? 0);
      const played =
        won + (stats?.lostAsGoats ?? 0) + (stats?.lostAsTigers ?? 0) + (stats?.draws ?? 0);
      return {
        stats: [
          { value: `${won}/${played}`, label: t("bagh.stat.won") },
          {
            value: `${stats?.wonAsGoats ?? 0}–${stats?.lostAsGoats ?? 0}`,
            label: t("bagh.stat.goats"),
          },
          {
            value: `${stats?.wonAsTigers ?? 0}–${stats?.lostAsTigers ?? 0}`,
            label: t("bagh.stat.tigers"),
          },
        ],
        played: played > 0,
        underway: Boolean(bagh?.game && !bagh.game.outcome),
      };
    }
  }
}

/**
 * A game's start screen, the same for every game: what it is, your record
 * so far, and one button to play, or to carry on with a game under way.
 */
export function Lobby({
  game,
  icon,
  title,
  about,
  onPlay,
  t,
}: {
  game: Game;
  icon: IconName;
  title: string;
  about: string;
  onPlay: () => void;
  t: TFn;
}) {
  const { stats, played, underway } = useLobbyData(game, t);
  return (
    <div className="space-y-3">
      <section className="surface-card flex flex-col items-center px-4 pt-5 pb-4 text-center">
        <span className="lobby-icon">
          <Icon name={icon} className="size-7" />
        </span>
        <p className="mt-2.5 text-[16px] font-semibold">{title}</p>
        <p className="mt-1 max-w-[260px] text-[11.5px] leading-snug text-text-secondary">{about}</p>
        <button
          type="button"
          onClick={onPlay}
          className="settings-btn settings-btn--accent mt-4 h-9 w-full justify-center text-[13px]"
        >
          <Icon name="play" className="size-3" />
          {t(underway ? "lobby.continue" : "lobby.play")}
        </button>
      </section>

      <section className="space-y-1.5">
        <p className="px-0.5 text-[11px] font-semibold text-text-secondary">{t("lobby.record")}</p>
        {played ? (
          <StatTiles stats={stats} />
        ) : (
          <p className="surface-card px-3 py-2.5 text-[11px] text-text-muted">{t("lobby.empty")}</p>
        )}
      </section>
    </div>
  );
}
