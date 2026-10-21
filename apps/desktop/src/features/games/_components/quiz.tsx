import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Icon } from "../../../shared/components/icon";
import { Switch } from "../../../shared/components/switch";
import type { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import type { QuizCategory } from "../../../types/api/QuizCategory";
import type { QuizView } from "../../../types/api/QuizView";
import { DailyQuestion } from "../daily-question";
import { useQuiz } from "../games-data";
import { StatTiles } from "./stat-tiles";

type TFn = ReturnType<typeof useSettings>["t"];

const TOPIC_KEYS = {
  nepal: "quiz.topic.nepal",
  civics: "quiz.topic.civics",
  geography: "quiz.topic.geography",
  calendar: "quiz.topic.calendar",
  units: "quiz.topic.units",
} as const satisfies Record<QuizCategory, string>;

/** Ten questions a round: pick a topic, answer, see what was right. */
export function Quiz({ t }: { t: TFn }) {
  const { data, mutate } = useQuiz();
  const [busy, setBusy] = useState(false);
  if (!data) return null;

  const act = async (task: Promise<QuizView>) => {
    if (busy) return;
    setBusy(true);
    try {
      await mutate(await task, { revalidate: false });
    } finally {
      setBusy(false);
    }
  };

  if (data.inRound && data.question) {
    const q = data.question;
    const answered = q.chosen !== null;
    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-0.5 text-[11px] text-text-muted">
          <span>
            {t(TOPIC_KEYS[q.category])} · {q.number}/{q.total}
          </span>
          <button
            type="button"
            onClick={() => void act(api.quizQuit())}
            className="hover:text-text-secondary"
          >
            {t("quiz.quit")}
          </button>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-[color:var(--color-divider)]">
          <div
            className="h-full rounded-full bg-[color:var(--color-accent-mark)] transition-[width]"
            style={{ width: `${((q.number - (answered ? 0 : 1)) / q.total) * 100}%` }}
          />
        </div>
        <section className="surface-card p-3.5">
          <p className="text-[15px] font-semibold leading-snug">{q.question}</p>
        </section>
        <div className="space-y-1.5">
          {q.options.map((option, place) => {
            const state = !answered
              ? ""
              : place === q.correct
                ? "quiz-option--right"
                : place === q.chosen
                  ? "quiz-option--wrong"
                  : "quiz-option--dim";
            return (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: options keep their place in a round
                key={place}
                type="button"
                disabled={answered || busy}
                onClick={() => void act(api.quizAnswer(place))}
                className={`quiz-option ${state}`}
              >
                <span className="quiz-option__letter">{"कखगघ"[place]}</span>
                <span className="min-w-0 flex-1 text-left">{option}</span>
                {answered && place === q.correct && <Icon name="checkmark" className="size-3.5" />}
              </button>
            );
          })}
        </div>
        {answered && (
          <button
            type="button"
            onClick={() => void act(api.quizNext())}
            className="settings-btn settings-btn--accent w-full justify-center"
          >
            {q.number === q.total ? t("quiz.see-score") : t("quiz.next")}
          </button>
        )}
      </div>
    );
  }

  const seen = data.topics.reduce((sum, topic) => sum + topic.total - topic.unseen, 0);
  const total = data.topics.reduce((sum, topic) => sum + topic.total, 0);
  return (
    <div className="space-y-2.5">
      {data.stats.answered > 0 && (
        <StatTiles
          stats={[
            {
              value: `${Math.round((data.stats.correct / data.stats.answered) * 100)}%`,
              label: t("quiz.stat.right"),
            },
            { value: `${seen}/${total}`, label: t("quiz.stat.seen") },
            { value: `${data.stats.bestRound}/10`, label: t("quiz.stat.best") },
            { value: String(data.stats.rounds), label: t("quiz.stat.rounds") },
          ]}
        />
      )}
      {data.finished && (
        <section className="surface-card p-3 text-center">
          <p className="text-[26px] font-bold tabular-nums">
            {data.score}/{data.roundTotal}
          </p>
          <p className="text-[12px] text-text-secondary">
            {data.score === data.roundTotal
              ? t("quiz.perfect")
              : data.score >= data.roundTotal * 0.7
                ? t("quiz.great")
                : t("quiz.again")}
          </p>
        </section>
      )}
      <TodaysQuestion onPlay={() => void act(api.quizStart(null))} t={t} />
      {!data.finished && data.stats.answered === 0 && (
        <p className="px-0.5 text-[11px] leading-snug text-text-secondary">{t("quiz.how")}</p>
      )}
      <p className="px-0.5 text-[11px] font-semibold text-text-secondary">{t("quiz.pick")}</p>
      <div className="grid grid-cols-2 gap-1.5">
        <TopicButton
          label={t("quiz.topic.all")}
          detail={t("quiz.mixed")}
          onClick={() => void act(api.quizStart(null))}
          wide
        />
        {data.topics.map((topic) => (
          <TopicButton
            key={topic.category}
            label={t(TOPIC_KEYS[topic.category])}
            detail={t("quiz.left")
              .replace("{n}", String(topic.unseen))
              .replace("{total}", String(topic.total))}
            onClick={() => void act(api.quizStart(topic.category))}
          />
        ))}
      </div>
    </div>
  );
}

function TopicButton({
  label,
  detail,
  onClick,
  wide = false,
}: {
  label: string;
  detail: string;
  onClick: () => void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`surface-card px-3 py-2.5 text-left transition-colors hover:bg-surface-hover ${wide ? "col-span-2" : ""}`}
    >
      <span className="block text-[12.5px] font-semibold">{label}</span>
      <span className="mt-0.5 block text-[10px] text-text-muted">{detail}</span>
    </button>
  );
}

/**
 * The question of the day, and the switch for its daily card. Answered just
 * now, it shows the result and leads on to a round; answered earlier, it
 * folds to one line so the topics come first, and opens again on a tap.
 */
function TodaysQuestion({ onPlay, t }: { onPlay: () => void; t: TFn }) {
  const { data: daily, mutate } = useSWR("quiz-daily", () => api.quizDaily());
  const { mutate: refresh } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  const [justAnswered, setJustAnswered] = useState(false);
  const [open, setOpen] = useState(false);
  if (!daily) return null;
  const answered = daily.chosen !== null;
  const right = answered && daily.chosen === daily.correct;

  const toggle = (
    <div className="flex items-center justify-between gap-3 border-divider border-t pt-2">
      <span className="text-[10.5px] text-text-muted">{t("quiz.daily.card-on")}</span>
      <Switch
        checked={daily.enabled}
        onChange={(enabled) => {
          void api
            .quizDailyEnable(enabled)
            .then(() => mutate({ ...daily, enabled }, { revalidate: false }));
        }}
        ariaLabel={t("quiz.daily.card-on")}
      />
    </div>
  );

  if (answered && !justAnswered && !open) {
    return (
      <section className="surface-card space-y-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2.5 text-left"
        >
          <span
            className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
              right ? "bg-positive/15 text-positive" : "bg-holiday/15 text-holiday"
            }`}
          >
            <Icon name={right ? "checkmark" : "close"} className="size-3" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold">
              {t(right ? "quiz.daily.done-right" : "quiz.daily.done-wrong")}
            </span>
            <span className="block text-[10.5px] text-text-muted">{t("quiz.daily.tomorrow")}</span>
          </span>
          <Icon name="chevronDown" className="size-3 shrink-0 text-text-muted" />
        </button>
        {toggle}
      </section>
    );
  }

  return (
    <section className="surface-card space-y-2.5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-accent-mark">{t("quiz.daily.title")}</p>
        {answered && !justAnswered && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("quiz.daily.fold")}
            className="text-text-muted transition-colors hover:text-text"
          >
            <Icon name="chevronUp" className="size-3" />
          </button>
        )}
      </div>
      <DailyQuestion
        daily={daily}
        busy={busy}
        onAnswer={(place) => {
          setBusy(true);
          api
            .quizDailyAnswer(place)
            .then(async (next) => {
              setJustAnswered(true);
              await mutate(next, { revalidate: false });
              // Answered, it counts as seen: the topics and the progress
              // panel move on with it.
              void refresh("quiz");
              void refresh("games-progress");
            })
            .catch(() => {})
            .finally(() => setBusy(false));
        }}
        t={t}
      />
      {justAnswered && (
        <button
          type="button"
          onClick={onPlay}
          className="settings-btn settings-btn--accent w-full justify-center"
        >
          <Icon name="play" className="size-3" />
          {t("quiz.daily.keep-going")}
        </button>
      )}
      {toggle}
    </section>
  );
}
