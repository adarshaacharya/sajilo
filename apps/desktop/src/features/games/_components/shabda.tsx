import { useEffect, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import type { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import type { ShabdaKey } from "../../../types/api/ShabdaKey";
import type { ShabdaView } from "../../../types/api/ShabdaView";
import { useShabda } from "../games-data";
import { StatTiles } from "./stat-tiles";

type TFn = ReturnType<typeof useSettings>["t"];

/**
 * शब्द: a word found letter by letter from its clue. Tap a letter (or type
 * it on a Nepali keyboard); a right one fills every place it is in, a wrong
 * one costs a life. Over, the next word is one tap away.
 */
export function Shabda({ t }: { t: TFn }) {
  const { data, mutate } = useShabda();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [help, setHelp] = useState(false);
  // Bumped on a miss, so the lives shake once each time.
  const [missed, setMissed] = useState(0);

  const run = async (task: () => Promise<ShabdaView>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const before = data?.livesLeft ?? 0;
      const next = await task();
      if (next.livesLeft < before && next.status !== "won") setMissed((n) => n + 1);
      await mutate(next, { revalidate: false });
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  const guess = (letter: string) => void run(() => api.shabdaLetter(letter));
  const next = () => void run(() => api.shabdaNext());

  const playing = data?.status === "playing";
  const keys = data ? [...data.vowels, ...data.consonants] : [];
  // A Nepali keyboard types the letters straight in; Enter moves on.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!playing && event.key === "Enter") {
        next();
        return;
      }
      const key = keys.find((each) => each.letter === event.key);
      if (playing && key?.state === "unused") guess(key.letter);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!data) return null;
  const over = !playing;

  return (
    <div className="space-y-2.5">
      <section className="surface-card px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10.5px] font-semibold text-accent-mark">{t("shabda.clue")}</p>
          <button
            type="button"
            onClick={() => setHelp((open) => !open)}
            aria-expanded={help}
            className="flex shrink-0 items-center gap-1 text-[10.5px] text-text-muted transition-colors hover:text-text"
          >
            <Icon name="info" className="size-3" />
            {t("shabda.how")}
          </button>
        </div>
        <p className="mt-0.5 text-[14px] font-semibold leading-snug">
          {data.clue ?? t("shabda.no-clue")}
        </p>
        {help && (
          <p className="mt-1.5 text-[11px] leading-snug text-text-secondary">{t("shabda.help")}</p>
        )}
      </section>

      <div className={`shabda-word ${data.status === "won" ? "shabda-word--won" : ""}`}>
        {data.tiles.map((tile, place) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: a word's places never move
            key={place}
            className={`shabda-tile ${
              tile.missed ? "shabda-tile--missed" : tile.akshar ? "shabda-tile--found" : ""
            }`}
            style={{ animationDelay: `${place * 70}ms` }}
          >
            {tile.akshar ?? ""}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 px-0.5">
        <span
          key={missed}
          className={`flex items-center gap-1 ${missed ? "shabda-lives--hit" : ""}`}
        >
          {Array.from({ length: data.lives }, (_, life) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: one dot per life, fixed
              key={life}
              className={`shabda-life ${life < data.livesLeft ? "shabda-life--on" : ""}`}
            />
          ))}
          <span className="ml-1 text-[10.5px] text-text-muted">
            {t(data.livesLeft === 1 ? "shabda.life" : "shabda.lives").replace(
              "{n}",
              String(data.livesLeft),
            )}
          </span>
        </span>
        {playing && (
          <button
            type="button"
            onClick={() => void run(() => api.shabdaHint())}
            disabled={busy || !data.hintLeft}
            className="shabda-hint"
            title={t("shabda.hint-title")}
          >
            <Icon name="bolt" className="size-3" />
            {t("shabda.hint")}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="px-0.5 text-[10.5px] text-holiday">
          {error}
        </p>
      )}

      {over ? (
        <Result view={data} busy={busy} onNext={next} t={t} />
      ) : (
        <div className="space-y-1.5">
          <Pad keys={data.vowels} busy={busy} onPick={guess} />
          <Pad keys={data.consonants} busy={busy} onPick={guess} />
        </div>
      )}
    </div>
  );
}

/** Letters to tap, eleven to a row; each shows what guessing it showed. */
function Pad({
  keys,
  busy,
  onPick,
}: {
  keys: ShabdaKey[];
  busy: boolean;
  onPick: (letter: string) => void;
}) {
  return (
    <div className="shabda-pad">
      {keys.map((key) => (
        <button
          key={key.letter}
          type="button"
          disabled={busy || key.state !== "unused"}
          onClick={() => onPick(key.letter)}
          className={`shabda-key shabda-key--${key.state}`}
        >
          {key.letter}
        </button>
      ))}
    </div>
  );
}

function Result({
  view,
  busy,
  onNext,
  t,
}: {
  view: ShabdaView;
  busy: boolean;
  onNext: () => void;
  t: TFn;
}) {
  const won = view.status === "won";
  const { stats } = view;
  const winRate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
  return (
    <section className="surface-card space-y-3 p-3">
      <p className="text-[14px] font-semibold">
        {won ? t("shabda.won") : t("shabda.lost").replace("{word}", view.answer ?? "")}
      </p>
      <StatTiles
        stats={[
          { value: String(stats.played), label: t("shabda.stat.played") },
          { value: `${winRate}%`, label: t("shabda.stat.won") },
          { value: String(stats.run), label: t("shabda.stat.run") },
          { value: String(stats.bestRun), label: t("shabda.stat.best") },
        ]}
      />
      <button
        type="button"
        onClick={onNext}
        disabled={busy}
        className="settings-btn settings-btn--accent w-full justify-center"
      >
        {t("shabda.next")}
        <Icon name="chevronRight" className="size-3" />
      </button>
    </section>
  );
}
