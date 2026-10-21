import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { useHeaderInner } from "../../shared/components/header-slot";
import { Icon, type IconName } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import { track } from "../../shared/lib/usage";
import { BaghChal } from "./_components/bagh-chal";
import { Chungi } from "./_components/chungi";
import { Katakuti } from "./_components/katakuti";
import { type Game, Lobby } from "./_components/lobby";
import { Quiz } from "./_components/quiz";
import { SaapSidhi } from "./_components/saap-sidhi";
import { Shabda } from "./_components/shabda";
import { Sudoku } from "./_components/sudoku";

const GAMES: Game[] = ["kata", "saap", "chungi", "quiz", "shabda", "sudoku", "bagh"];
const TITLES = {
  shabda: "shabda.title",
  quiz: "quiz.title",
  sudoku: "sudoku.title",
  bagh: "bagh.title",
  kata: "kata.title",
  saap: "saap.title",
  chungi: "chungi.title",
} as const satisfies Record<Game, string>;

/** Each game's start-screen icon and one-line description. */
const LOBBY = {
  kata: { icon: "katakuti", about: "kata.card" },
  saap: { icon: "saapSidhi", about: "saap.card" },
  chungi: { icon: "chungi", about: "chungi.card" },
  quiz: { icon: "quiz", about: "quiz.card" },
  shabda: { icon: "wordGame", about: "shabda.card" },
  sudoku: { icon: "sudoku", about: "sudoku.card" },
  bagh: { icon: "baghChal", about: "bagh.card" },
} as const satisfies Record<Game, { icon: IconName; about: string }>;

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
  // A game opens on its start screen; a link straight to one (the daily
  // question's "More") goes on into it.
  const [playing, setPlaying] = useState(() => open !== null);
  useEffect(() => {
    if (open) track(`tab.games.${open}`);
  }, [open]);
  const choose = (game: Game) => {
    setPlaying(false);
    setOpen(game);
  };
  useHeaderInner(
    open
      ? {
          title: t(TITLES[open]),
          // Back from a game is its start screen; back again, the list.
          onBack: () => (playing ? setPlaying(false) : setOpen(null)),
        }
      : null,
  );

  if (open && !playing) {
    return (
      <Lobby
        game={open}
        icon={LOBBY[open].icon}
        title={t(TITLES[open])}
        about={t(LOBBY[open].about)}
        onPlay={() => setPlaying(true)}
        t={t}
      />
    );
  }
  if (open === "shabda") return <Shabda t={t} />;
  if (open === "quiz") return <Quiz t={t} />;
  if (open === "sudoku") return <Sudoku t={t} />;
  if (open === "bagh") return <BaghChal t={t} />;
  if (open === "kata") return <Katakuti t={t} />;
  if (open === "saap") return <SaapSidhi t={t} />;
  if (open === "chungi") return <Chungi t={t} />;

  return (
    <div className="space-y-2.5">
      {GAMES.map((game) => (
        <GameCard
          key={game}
          icon={LOBBY[game].icon}
          title={t(TITLES[game])}
          onOpen={() => choose(game)}
        />
      ))}
      <p className="px-0.5 text-[10px] leading-relaxed text-text-muted">{t("games.note")}</p>
    </div>
  );
}

/** A game in the list: its icon and name. What it is, and the record, are
 * on its start screen. */
function GameCard({ icon, title, onOpen }: { icon: IconName; title: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="surface-card flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-[color:color-mix(in_srgb,var(--color-accent-mark)_14%,transparent)] text-accent-mark">
        <Icon name={icon} className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{title}</span>
      <Icon name="chevronRight" className="size-3 shrink-0 text-text-muted" />
    </button>
  );
}
