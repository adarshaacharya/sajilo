import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { useHeaderInner } from "../../shared/components/header-slot";
import { Icon, type IconName } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import { track } from "../../shared/lib/usage";
import { BaghChal } from "./_components/bagh-chal";
import { Chungi } from "./_components/chungi";
import { JhandiBurja } from "./_components/jhandi-burja";
import { Katakuti } from "./_components/katakuti";
import { type Game, Lobby, useUnderway } from "./_components/lobby";
import { Quiz } from "./_components/quiz";
import { SaapSidhi } from "./_components/saap-sidhi";
import { Shabda } from "./_components/shabda";
import { Sudoku } from "./_components/sudoku";

const GAMES: Game[] = ["kata", "saap", "chungi", "jhandi", "bagh", "quiz", "shabda", "sudoku"];
/** The list in two short groups: games to play, and ones to think through. */
const GROUPS = [
  { label: "games.group.play", games: ["kata", "saap", "chungi", "jhandi", "bagh"] },
  { label: "games.group.puzzles", games: ["quiz", "shabda", "sudoku"] },
] as const satisfies readonly { label: string; games: readonly Game[] }[];
const TITLES = {
  shabda: "shabda.title",
  quiz: "quiz.title",
  sudoku: "sudoku.title",
  bagh: "bagh.title",
  kata: "kata.title",
  saap: "saap.title",
  chungi: "chungi.title",
  jhandi: "jhandi.title",
} as const satisfies Record<Game, string>;

/** Each game's start-screen icon and one-line description. */
const LOBBY = {
  kata: { icon: "katakuti", about: "kata.card" },
  saap: { icon: "saapSidhi", about: "saap.card" },
  chungi: { icon: "chungi", about: "chungi.card" },
  jhandi: { icon: "jhandi", about: "jhandi.card" },
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
  const underway = useUnderway();
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
  if (open === "jhandi") return <JhandiBurja t={t} />;

  return (
    <div className="space-y-3">
      {GROUPS.map((group) => (
        <section key={group.label} className="space-y-1.5">
          <p className="px-0.5 text-[11px] font-semibold text-text-secondary">{t(group.label)}</p>
          <ul className="surface-card overflow-hidden">
            {group.games.map((game) => (
              <GameRow
                key={game}
                game={game}
                icon={LOBBY[game].icon}
                title={t(TITLES[game])}
                underway={underway[game] ? t("games.underway") : null}
                onOpen={() => choose(game)}
              />
            ))}
          </ul>
        </section>
      ))}
      <p className="px-0.5 text-[10px] leading-relaxed text-text-muted">{t("games.note")}</p>
    </div>
  );
}

/** A game in the list: its icon in the game's own colour, its name (with the
 * English gloss beside "काटाकुटी · Tic-Tac-Toe" smaller), and a word when
 * a game is under way. What it is, and the record, are on its start screen. */
function GameRow({
  game,
  icon,
  title,
  underway,
  onOpen,
}: {
  game: Game;
  icon: IconName;
  title: string;
  underway: string | null;
  onOpen: () => void;
}) {
  const [name, gloss] = title.split(" · ");
  return (
    <li className="border-b border-divider last:border-b-0">
      <button type="button" onClick={onOpen} className={`game-row game-tint--${game}`}>
        <span className="game-row__icon">
          <Icon name={icon} className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="game-row__name">{name}</span>
          {gloss && <span className="game-row__gloss"> {gloss}</span>}
        </span>
        {underway && <span className="game-row__state">{underway}</span>}
        <Icon name="chevronRight" className="size-3 shrink-0 text-text-muted" />
      </button>
    </li>
  );
}
