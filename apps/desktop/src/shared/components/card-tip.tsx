import { useEffect, useState } from "react";
import { api, type BreakTip } from "../lib/ipc";
import { track } from "../lib/usage";
import { Icon } from "./icon";

/**
 * At most one quiet line a day about a part of Sajilo not tried yet, at the
 * foot of a break or reminder card. The shell decides whether one is due;
 * asked once per card (`cardKey`). An example card always gets one.
 */
export function useCardTip(cardKey: string | null, preview: boolean): BreakTip | null {
  const [tip, setTip] = useState<BreakTip | null>(null);
  useEffect(() => {
    setTip(null);
    if (!cardKey) return;
    api
      .breakTip(preview)
      .then(setTip)
      .catch(() => {});
  }, [cardKey, preview]);
  return tip;
}

export function CardTip({ tip }: { tip: BreakTip }) {
  return (
    <button
      type="button"
      onClick={() => {
        track("action.tip-open");
        void api.openScreen(tip.route).catch(() => {});
      }}
      className="break-card__tip"
    >
      <Icon name="lightbulb" className="size-3 shrink-0 text-accent-mark" />
      <span className="min-w-0 flex-1">{tip.text}</span>
      <Icon name="chevronRight" className="size-2.5 shrink-0" />
    </button>
  );
}
