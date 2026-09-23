import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import type { BreakKind, FocusSnapshot } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import { KIND_ICONS, KIND_TINTS, useSentenceNumerals } from "../_lib/format";

const LINES = {
  eyes: "focus.intro.eyes",
  move: "focus.intro.move",
  water: "focus.intro.water",
} as const;

/**
 * What someone sees before any reminder is on: what this does, in plain
 * words, and a way to see the real card before agreeing to it.
 */
export function Intro({
  snapshot,
  onTurnOn,
  onExample,
}: {
  snapshot: FocusSnapshot;
  onTurnOn: () => void;
  onExample: (kind: BreakKind) => void;
}) {
  const { t } = useSettings();
  const numerals = useSentenceNumerals();

  return (
    <section className="surface-card p-4">
      <h2 className="text-[16px] font-semibold leading-snug">{t("focus.intro.title")}</h2>
      <p className="mt-1.5 text-[12px] leading-relaxed text-text-secondary">
        {t("focus.intro.body")}
      </p>

      <ul className="mt-4 space-y-2.5">
        {snapshot.breaks
          .filter((item) => item.kind in LINES)
          .map((item) => (
            <li key={item.kind} className="flex items-center gap-2.5 text-[12px]">
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-full"
                style={{
                  color: KIND_TINTS[item.kind],
                  background: `color-mix(in srgb, ${KIND_TINTS[item.kind]} 14%, transparent)`,
                }}
              >
                <Icon name={KIND_ICONS[item.kind]} className="size-3.5" />
              </span>
              {t(LINES[item.kind as keyof typeof LINES]).replace(
                "{n}",
                digits(item.everyMinutes, numerals),
              )}
            </li>
          ))}
      </ul>

      <p className="mt-4 text-[11px] leading-relaxed text-text-muted">{t("focus.intro.fine")}</p>

      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={onTurnOn}
          className="settings-btn settings-btn--accent w-full justify-center text-center text-[12px]"
        >
          {t("focus.intro.turn-on")}
        </button>
        <button
          type="button"
          onClick={() => onExample("eyes")}
          className="settings-btn w-full justify-center text-center text-[12px]"
        >
          {t("focus.intro.example")}
        </button>
      </div>
    </section>
  );
}
