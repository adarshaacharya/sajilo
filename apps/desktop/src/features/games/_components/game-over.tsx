import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { StatTiles } from "./stat-tiles";

export type GameResult = "won" | "lost" | "draw";

/**
 * The end of a game, the same in every game: a card over the board with
 * the result, the record, and the next game one tap away. A win gets a
 * shower of confetti. "See board" folds it away so the last position can
 * be looked at; the game shows its own way back.
 */
export function GameOver({
  result,
  title,
  detail,
  stats,
  againLabel,
  onAgain,
  closeLabel,
  onClose,
  busy = false,
}: {
  result: GameResult;
  title: string;
  detail?: string;
  stats?: { value: string; label: string }[];
  againLabel: string;
  onAgain: () => void;
  closeLabel: string;
  onClose: () => void;
  busy?: boolean;
}) {
  // Enter on the popup plays again; Escape folds it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") onAgain();
      else if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAgain, onClose]);

  return (
    <div className="game-over" role="dialog" aria-modal="true" aria-label={title}>
      {result === "won" && <Confetti />}
      <section className={`game-over__card game-over__card--${result}`}>
        <span className="game-over__badge" aria-hidden="true">
          {result === "won" ? "🏆" : result === "draw" ? "🤝" : "😅"}
        </span>
        <p className="game-over__title">{title}</p>
        {detail && <p className="game-over__detail">{detail}</p>}
        {stats && stats.length > 0 && (
          <div className="mt-3 w-full">
            <StatTiles stats={stats} />
          </div>
        )}
        <button
          type="button"
          onClick={onAgain}
          disabled={busy}
          className="settings-btn settings-btn--accent mt-3 h-9 w-full justify-center text-[13px]"
        >
          <Icon name="refresh" className="size-3.5" />
          {againLabel}
        </button>
        <button type="button" onClick={onClose} className="game-over__close">
          {closeLabel}
        </button>
      </section>
    </div>
  );
}

const COLOURS = ["#f6c945", "#62bf6e", "#5aa3e6", "#ef6f5c", "#a98be8"];

/** Bits of paper falling from the top, each with its own drift and delay. */
export function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 36 }, (_, index) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      duration: 1.6 + Math.random() * 1.2,
      drift: (Math.random() - 0.5) * 80,
      turn: (Math.random() - 0.5) * 720,
      colour: COLOURS[index % COLOURS.length],
      wide: Math.random() > 0.5,
    })),
  );
  const style = useMemo(
    () =>
      pieces.map((piece) => ({
        left: `${piece.left}%`,
        background: piece.colour,
        width: piece.wide ? 8 : 5,
        height: piece.wide ? 5 : 9,
        animationDelay: `${piece.delay}s`,
        animationDuration: `${piece.duration}s`,
        "--drift": `${piece.drift}px`,
        "--turn": `${piece.turn}deg`,
      })),
    [pieces],
  );
  return (
    <div className="game-over__confetti" aria-hidden="true">
      {style.map((each, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the pieces never reorder
        <span key={index} style={each as CSSProperties} />
      ))}
    </div>
  );
}
