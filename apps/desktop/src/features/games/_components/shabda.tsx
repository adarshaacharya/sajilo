import { useEffect, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import type { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import type { ShabdaMark } from "../../../types/api/ShabdaMark";
import type { ShabdaView } from "../../../types/api/ShabdaView";
import { useShabda } from "../games-data";

type TFn = ReturnType<typeof useSettings>["t"];

/** Long enough for any three Nepali letters typed in English. */
const MAX_INPUT = 24;

const TILE: Record<ShabdaMark, string> = {
  correct: "shabda-tile--correct",
  present: "shabda-tile--present",
  close: "shabda-tile--close",
  absent: "shabda-tile--absent",
};

/** Today's word puzzle: the grid, a line to type in, and the result. */
export function Shabda({ t }: { t: TFn }) {
  const { data, mutate } = useShabda();
  const [text, setText] = useState("");
  const [typed, setTyped] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    let current = true;
    if (!text.trim()) {
      setTyped([]);
      return;
    }
    api
      .shabdaLetters(text)
      .then((letters) => current && setTyped(letters))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [text]);

  if (!data) return null;
  const playing = data.status === "playing";

  const guess = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await mutate(await api.shabdaGuess(text), { revalidate: false });
      setText("");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="text-[11px] text-text-secondary">
          {t("shabda.intro").replace("{n}", String(data.length))}
        </p>
        <button
          type="button"
          onClick={() => setHelp((open) => !open)}
          aria-expanded={help}
          className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-accent-mark"
        >
          <Icon name="info" className="size-3" />
          {t("shabda.how")}
        </button>
      </div>
      {help && <Help t={t} />}

      <Grid view={data} typed={playing ? typed : []} />
      {playing && <Key t={t} />}

      {playing ? (
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            <input
              value={text}
              maxLength={MAX_INPUT}
              onChange={(event) => {
                setText(event.target.value);
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void guess();
              }}
              placeholder={t("shabda.placeholder")}
              aria-label={t("shabda.placeholder")}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              className="control-field h-[30px] min-w-0 flex-1 rounded-[6px] px-2 text-[13px] outline-none"
            />
            <button
              type="button"
              onClick={() => void guess()}
              disabled={busy || typed.length === 0}
              className="settings-btn settings-btn--accent h-[30px] shrink-0 px-3"
            >
              {t("shabda.guess")}
            </button>
          </div>
          <p
            role={error ? "alert" : undefined}
            className={`px-0.5 text-[10.5px] ${error ? "text-holiday" : "text-text-muted"}`}
          >
            {error || t("shabda.left").replace("{n}", String(data.maxGuesses - data.rows.length))}
          </p>
        </div>
      ) : (
        <Result view={data} t={t} />
      )}
    </div>
  );
}

/** Six rows of three. Played rows show their marks; the next shows what is
 * being typed; the rest are empty until the game ends. */
function Grid({ view, typed }: { view: ShabdaView; typed: string[] }) {
  // Once it is over, the empty rows only push the result out of sight.
  const shown = view.status === "playing" ? view.maxGuesses : view.rows.length;
  const rows = Array.from({ length: shown }, (_, index) => index);
  return (
    <div className="shabda-grid">
      {rows.map((row) => {
        const played = view.rows[row];
        const current = row === view.rows.length;
        return (
          <div key={row} className="shabda-row">
            {Array.from({ length: view.length }, (_, col) => col).map((col) => {
              const tile = played?.[col];
              const letter = tile?.akshar ?? (current ? typed[col] : undefined);
              return (
                <span
                  key={col}
                  className={`shabda-tile ${tile ? TILE[tile.mark] : letter ? "shabda-tile--typed" : ""}`}
                >
                  {letter ?? ""}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Result({ view, t }: { view: ShabdaView; t: TFn }) {
  const [copied, setCopied] = useState(false);
  const won = view.status === "won";
  const { stats } = view;
  const winRate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
  const share = async () => {
    if (!view.share) return;
    await navigator.clipboard.writeText(view.share).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="surface-card space-y-3 p-3">
      <div>
        <p className="text-[14px] font-semibold">
          {won
            ? t("shabda.won").replace("{n}", String(view.rows.length))
            : t("shabda.lost").replace("{word}", view.answer ?? "")}
        </p>
        <p className="mt-0.5 text-[11px] text-text-secondary">{t("shabda.tomorrow")}</p>
      </div>
      <div className="grid grid-cols-4 gap-1.5 text-center">
        {[
          [stats.played, t("shabda.stat.played")],
          [`${winRate}%`, t("shabda.stat.won")],
          [stats.streak, t("shabda.stat.streak")],
          [stats.bestStreak, t("shabda.stat.best")],
        ].map(([value, label]) => (
          <div key={String(label)} className="rounded-[6px] bg-surface-hover px-1 py-1.5">
            <p className="text-[15px] font-semibold tabular-nums">{value}</p>
            <p className="text-[9.5px] text-text-muted">{label}</p>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void share()}
        className="settings-btn settings-btn--accent w-full justify-center"
      >
        <Icon name={copied ? "checkmark" : "copy"} className="size-3" />
        {copied ? t("shabda.copied") : t("shabda.share")}
      </button>
    </section>
  );
}

/** The marks in one line under the grid, always in view while playing. */
function Key({ t }: { t: TFn }) {
  const marks: [ShabdaMark, string][] = [
    ["correct", t("shabda.key.correct")],
    ["present", t("shabda.key.present")],
    ["close", t("shabda.key.close")],
    ["absent", t("shabda.key.absent")],
  ];
  return (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-text-muted">
      {marks.map(([mark, label]) => (
        <span key={mark} className="flex items-center gap-1">
          <span className={`shabda-tile shabda-tile--dot ${TILE[mark]}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

function Help({ t }: { t: TFn }) {
  const rows: [ShabdaMark, string][] = [
    ["correct", t("shabda.help.correct")],
    ["present", t("shabda.help.present")],
    ["close", t("shabda.help.close")],
    ["absent", t("shabda.help.absent")],
  ];
  return (
    <section className="surface-card space-y-1.5 p-3 text-[11px]">
      <p className="text-text-secondary">{t("shabda.help.body")}</p>
      {rows.map(([mark, line]) => (
        <div key={mark} className="flex items-center gap-2">
          <span className={`shabda-tile shabda-tile--small ${TILE[mark]}`}>क</span>
          <span>{line}</span>
        </div>
      ))}
    </section>
  );
}
