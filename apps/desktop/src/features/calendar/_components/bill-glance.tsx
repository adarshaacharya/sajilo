import { useNavigate } from "react-router";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { loadedValue } from "../../../shared/lib/load-state";
import { dueLine, dueToneOf, rupees, useElectricity } from "../../keeper/electricity-due";

/**
 * The electricity bill on the home screen, only while there is one to pay:
 * the amount, and what paying it now costs. Paid, or never set up, and it is
 * not there at all. Tap it for the bill in Keeper.
 */
export function BillGlance() {
  const { t, modules } = useSettings();
  const navigate = useNavigate();
  const { data } = useElectricity();
  const due = loadedValue(data)?.due;
  if (!modules.keeperEnabled || !due) return null;

  return (
    <button
      type="button"
      onClick={() => navigate("/keeper?section=electricity")}
      className="surface-card flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Icon name="bolt" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold">
          {t("electricity.glance").replace("{month}", due.month)}
          <span className="ml-1.5 tabular-nums">{rupees(due.withRebate ?? due.total)}</span>
        </span>
        <span className={`mt-0.5 block truncate text-[10.5px] font-medium ${dueToneOf(due)}`}>
          {dueLine(t, due)}
        </span>
      </span>
      <Icon name="chevronRight" className="size-3 shrink-0 text-text-muted" />
    </button>
  );
}
