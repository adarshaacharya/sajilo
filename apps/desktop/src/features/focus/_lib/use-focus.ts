import { useCallback, useEffect, useState } from "react";
import { api, type FocusSnapshot } from "../../../shared/lib/ipc";

/** Matches the tracker's own tick, so a countdown never looks stuck. */
const REFRESH_MS = 15_000;

export type FocusLoad =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; snapshot: FocusSnapshot };

/**
 * The Focus snapshot, refreshed while the screen is open. Every action returns
 * the new snapshot, so a toggle or a logged glass shows at once rather than on
 * the next refresh.
 */
export function useFocus() {
  const [load, setLoad] = useState<FocusLoad>({ status: "loading" });

  const apply = useCallback((snapshot: FocusSnapshot | null) => {
    // The landing page's recording answers null for a command it did not record.
    setLoad(
      snapshot
        ? { status: "ready", snapshot }
        : { status: "failed", message: "Focus is not available here." },
    );
  }, []);

  const refresh = useCallback(() => {
    api
      .focusSnapshot()
      .then(apply)
      .catch((cause) => setLoad({ status: "failed", message: String(cause) }));
  }, [apply]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  /** Runs an action and shows the snapshot it returns. Anything else — a
   * failure, or the landing page dropping the write — re-reads instead. */
  const act = useCallback(
    (action: () => Promise<FocusSnapshot>) => {
      action()
        .then((snapshot) => (snapshot ? apply(snapshot) : refresh()))
        .catch(() => refresh());
    },
    [apply, refresh],
  );

  return { load, refresh, act };
}
