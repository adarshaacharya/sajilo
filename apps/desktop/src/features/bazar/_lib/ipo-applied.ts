import { useMemo } from "react";
import { usePersistedList } from "../../../shared/lib/persisted";

/** Also read by the tray's closing-day reminders (`prefs::IPO_APPLIED`). */
const APPLIED_KEY = "ipoApplied";
/** Old keys age out on their own; nobody needs a record of last year's issues. */
const APPLIED_LIMIT = 40;

/**
 * Issues the user has marked as applied. Sajilo cannot see MeroShare, so this
 * is the user's own word, kept on this device — and it is what stops the home
 * screen from nagging about an issue they already dealt with on day one.
 */
export function useAppliedIpos() {
  const [keys, setKeys, loaded] = usePersistedList(APPLIED_KEY);
  const applied = useMemo(() => new Set(keys), [keys]);

  const toggle = (key: string) =>
    setKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key].slice(-APPLIED_LIMIT),
    );

  return { applied, loaded, toggle };
}
