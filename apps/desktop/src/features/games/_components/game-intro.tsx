import { useState } from "react";
import { Icon } from "../../../shared/components/icon";
import type { useSettings } from "../../../shared/context/settings-context";

type TFn = ReturnType<typeof useSettings>["t"];

/**
 * A game's name, with its rules a tap away rather than read out every time:
 * someone who knows the game goes straight to the choices below.
 */
export function GameIntro({ title, rules, t }: { title: string; rules: string; t: TFn }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] font-semibold">{title}</p>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex shrink-0 items-center gap-1 text-[10.5px] text-text-muted transition-colors hover:text-text"
        >
          <Icon name="info" className="size-3" />
          {t("shabda.how")}
        </button>
      </div>
      {open && <p className="mt-1 text-[11px] leading-snug text-text-secondary">{rules}</p>}
    </div>
  );
}
