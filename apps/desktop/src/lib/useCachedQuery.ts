import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type Fetcher<T> = (refresh: boolean) => Promise<T>;

/**
 * A module-level cache keyed by string, shared across every component
 * instance and every mount for the life of the app.
 *
 * Screens live under React Router routes, so navigating away and back
 * unmounts and remounts them — a plain `useState` starts over at `undefined`
 * every time, which is why switching to a screen always flashed a loading
 * state even when the backend's own cache (`feed.rs`) had the answer ready
 * in milliseconds. Keeping the last-resolved value here means a remount
 * repaints instantly from cache, and a refresh only ever replaces what's
 * cached once the new fetch resolves — it never clears it first.
 *
 * `useSyncExternalStore` is what makes this safe to read during render: it's
 * the primitive React gives you for subscribing to state that lives outside
 * React, rather than mirroring it into a `useState` by hand.
 */
const cache = new Map<string, unknown>();
const subscribers = new Map<string, Set<() => void>>();

function subscribersFor(key: string): Set<() => void> {
  let set = subscribers.get(key);
  if (!set) {
    set = new Set();
    subscribers.set(key, set);
  }
  return set;
}

function setCached<T>(key: string, value: T) {
  cache.set(key, value);
  for (const notify of subscribersFor(key)) notify();
}

/**
 * Fetches `fetcher` on mount and on `reload()`, caching the result by `key`.
 *
 * `value` is the last-resolved result for `key` — `undefined` only until the
 * very first fetch for that key completes anywhere in the app. `isValidating`
 * is true while a fetch is in flight, whether that's the first one or a
 * background refresh; the old `value` stays in place throughout.
 */
export function useCachedQuery<T>(key: string, fetcher: Fetcher<T>) {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const value = useSyncExternalStore(
    useCallback(
      (onChange) => {
        const set = subscribersFor(key);
        set.add(onChange);
        return () => {
          set.delete(onChange);
        };
      },
      [key],
    ),
    () => cache.get(key) as T | undefined,
  );

  const [isValidating, setIsValidating] = useState(false);

  const reload = useCallback(
    (refresh = false) => {
      setIsValidating(true);
      fetcherRef
        .current(refresh)
        .then((next) => setCached(key, next))
        .finally(() => setIsValidating(false));
    },
    [key],
  );

  // Re-runs whenever `key` itself changes (e.g. switching weather city), not
  // on every render — `reload` is stable per key via the `useCallback` above.
  useEffect(() => {
    reload();
  }, [reload]);

  return { value, isValidating, reload };
}
