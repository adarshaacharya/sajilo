import type { translate } from "../../../shared/lib/i18n";
import type { IpoPhase } from "./ipo";

type TFn = (key: Parameters<typeof translate>[0]) => string;

/**
 * "Closes in 2 days" and its siblings. `count` draws the number, so the home
 * screen can render it in the user's numerals while Bazar keeps Latin digits
 * beside its prices.
 */
export function phaseLabel(
  phase: IpoPhase,
  t: TFn,
  count: (n: number) => string = String,
): string | null {
  switch (phase.kind) {
    case "open":
      if (phase.daysLeft === 0) return t("stocks.ipo-closes-today");
      if (phase.daysLeft === 1) return t("stocks.ipo-closes-tomorrow");
      return t("stocks.ipo-closes-in").replace("{n}", count(phase.daysLeft));
    case "upcoming":
      if (phase.daysUntil === 1) return t("stocks.ipo-opens-tomorrow");
      return t("stocks.ipo-opens-in").replace("{n}", count(phase.daysUntil));
    case "closed":
      return t("stocks.ipo-closed");
    default:
      return null;
  }
}
