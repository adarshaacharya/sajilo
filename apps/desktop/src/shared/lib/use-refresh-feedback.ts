import { useCallback, useRef, useState } from "react";
import type { LoadState } from "../../types/api/LoadState";
import type { Toast } from "../components/toast";
import { useSettings } from "../context/settings-context";

/** A second tap this soon after a refresh is answered without fetching again:
 * the sources have not moved in thirty seconds, and the tap is a question,
 * "is this the latest?", not a request for more scraping. */
const COOLDOWN_MS = 30_000;

/** What a screen shows right now, compared with what a refresh brought back.
 * The fetch time travels inside every payload and changes on every fetch, so
 * it is left out: a refresh that only moved the clock changed nothing anyone
 * can see. */
function fingerprint(states: readonly (LoadState<unknown> | undefined)[]): string {
  const values = states.map((state) =>
    state && (state.status === "fresh" || state.status === "stale") ? state.value : null,
  );
  return JSON.stringify(values, (key, value) => (key === "fetchedAt" ? undefined : value));
}

/**
 * The answer to the refresh button. The spinner alone left people unsure
 * whether anything happened, because most sources change once a day and a
 * refresh usually brings back exactly what was on screen. So every refresh
 * ends in one short line: updated, already up to date, or the source could
 * not be reached and saved data is showing.
 *
 * `run` takes what is on screen before, and a refresh that resolves to what
 * came back. `unchanged` can name when a screen's source publishes, so
 * "nothing new" reads as expected rather than broken.
 */
export function useRefreshFeedback(unchanged?: string) {
  const { t } = useSettings();
  const [toast, setToast] = useState<Toast | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const lastChecked = useRef(0);

  const run = useCallback(
    async (
      before: readonly (LoadState<unknown> | undefined)[],
      refresh: () => Promise<readonly (LoadState<unknown> | undefined)[]>,
    ) => {
      if (refreshing) return;
      if (Date.now() - lastChecked.current < COOLDOWN_MS) {
        setToast({ text: t("refresh.just-checked") });
        return;
      }
      setRefreshing(true);
      setToast(null);
      try {
        const after = await refresh();
        const reached = after.filter((state) => state?.status === "fresh").length;
        // Nothing back at all counts as not reached, never as "unchanged".
        const missed = after.filter((state) => state?.status !== "fresh").length;
        if (reached === 0 && missed > 0) {
          setToast({ text: t("refresh.failed") });
          return;
        }
        // Only a refresh that reached its sources earns the cooldown; a
        // failed one should be retryable at once.
        lastChecked.current = Date.now();
        if (missed > 0) {
          setToast({ text: t("refresh.partial") });
        } else if (fingerprint(before) === fingerprint(after)) {
          setToast({ text: unchanged ?? t("refresh.unchanged") });
        } else {
          setToast({ text: t("refresh.updated") });
        }
      } catch {
        setToast({ text: t("refresh.failed") });
      } finally {
        setRefreshing(false);
      }
    },
    [refreshing, t, unchanged],
  );

  const dismiss = useCallback(() => setToast(null), []);

  return { run, refreshing, toast, dismiss };
}
