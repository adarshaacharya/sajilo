import { Icon } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import type { QuizDaily } from "../../types/api/QuizDaily";

type TFn = ReturnType<typeof useSettings>["t"];

/** Longest option, in characters, that sits on one line in half the card.
 * Past it the options stack as a list instead: a long one wrapping inside a
 * half-width box makes the grid tall and uneven. */
const SHORT = 16;
const KEYS = { en: ["A", "B", "C", "D"], ne: ["क", "ख", "ग", "घ"] };

/**
 * The question of the day: four options, answered with one tap, then the
 * right one shown. The same on the reminder card and in the quiz. Short
 * options sit two by two; any long one puts all four in a lettered list.
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
  const { language } = useSettings();
  const answered = daily.chosen !== null;
  const stacked = daily.options.some((option) => [...option].length > SHORT);
  const keys = KEYS[language === "ne" ? "ne" : "en"];
  return (
    <div className="space-y-1.5">
      <p className="text-[14px] font-semibold leading-snug">{daily.question}</p>
      <div className={stacked ? "grid gap-1" : "grid grid-cols-2 gap-1.5"}>
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
              className={`quiz-option quiz-option--compact ${
                stacked ? "quiz-option--row" : ""
              } ${state}`}
            >
              {stacked && <span className="quiz-option__key">{keys[place]}</span>}
              <span className="min-w-0 flex-1 text-left">{option}</span>
              {answered && place === daily.correct && (
                <Icon name="checkmark" className="size-3 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
      {answered && (
        <p
          className={`text-[11.5px] font-medium ${
            daily.chosen === daily.correct ? "text-positive" : "text-holiday"
          }`}
        >
          {daily.chosen === daily.correct ? t("quiz.daily.right") : t("quiz.daily.wrong")}
        </p>
      )}
    </div>
  );
}
