import { useSettings } from "../../../shared/context/settings-context";
import { loadedValue } from "../../../shared/lib/load-state";
import type { LoadState } from "../../../types/api/LoadState";
import type { MutualFundSnapshot } from "../../../types/api/MutualFundSnapshot";
import { issueDate } from "../_lib/ipo";

/**
 * The NEPSE view's way into mutual funds, for anyone who never looks past the
 * first sub-tab. Drawn only once there are NAVs to point at, so it never
 * promises a view that would open onto an error.
 */
export function FundsLink({
  state,
  onOpen,
}: {
  state: LoadState<MutualFundSnapshot> | undefined;
  onOpen: () => void;
}) {
  const { t, language } = useSettings();
  const snapshot = loadedValue(state);
  if (!snapshot || snapshot.funds.length === 0) return null;

  const newest = snapshot.funds.reduce(
    (latest, fund) => (fund.latest.date > latest ? fund.latest.date : latest),
    "",
  );

  return (
    <button
      type="button"
      onClick={onOpen}
      className="surface-card flex w-full items-center gap-2 p-2.5 text-left transition-colors hover:bg-surface-hover"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium">{t("stocks.view-funds")}</span>
        <span className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-text-muted tabular-nums">
          <span className="rounded-md bg-surface px-1.5 text-[10px] font-medium leading-4 text-text-secondary">
            {snapshot.funds.length}
          </span>
          {t("funds.summary").replace("{date}", issueDate(newest, language) ?? newest)}
        </span>
      </span>
      <span aria-hidden className="text-text-muted">
        ›
      </span>
    </button>
  );
}
