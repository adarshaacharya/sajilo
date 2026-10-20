import { Icon } from "../../shared/components/icon";
import type { useSettings } from "../../shared/context/settings-context";
import type { QuizDaily } from "../../types/api/QuizDaily";

type TFn = ReturnType<typeof useSettings>["t"];

/**
 * The question of the day: four options, answered with one tap, then the
 * right one shown. The same on the reminder card and in the quiz.
 */
export function DailyQuestion({
  daily,
  onAnswer,
  busy = false,
  t,
}: {
  daily: QuizDaily;
  onAnswer: (place: number) => void;
  busy?: boolean;
  t: TFn;
}) {
  const answered = daily.chosen !== null;
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-semibold leading-snug">{daily.question}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {daily.options.map((option, place) => {
          const state = !answered
            ? ""
            : place === daily.correct
              ? "quiz-option--right"
              : place === daily.chosen
                ? "quiz-option--wrong"
                : "quiz-option--dim";
          return (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: options keep their place for the day
              key={place}
              type="button"
              disabled={answered || busy}
              onClick={() => onAnswer(place)}
              className={`quiz-option quiz-option--compact ${state}`}
            >
              <span className="min-w-0 flex-1 text-left">{option}</span>
              {answered && place === daily.correct && (
                <Icon name="checkmark" className="size-3 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
      {answered && (
        <p className="text-[11px] font-medium">
          {daily.chosen === daily.correct ? t("quiz.daily.right") : t("quiz.daily.wrong")}
        </p>
      )}
    </div>
  );
}
