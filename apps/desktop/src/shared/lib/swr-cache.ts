import type { Cache } from "swr";

const STORAGE_KEY = "sajilo-swr-cache";
const BUILD_KEY = "sajilo-swr-cache-build";
const WRITE_DELAY_MS = 500;

/**
 * SWR cache backed by localStorage, so a fresh webview paints the last
 * fetched data immediately and revalidates in the background instead of
 * showing a loading placeholder. Without this the cache lives only in
 * memory and dies with the webview on every app restart.
 *
 * Writes are debounced and write-through — a tray app is killed, not
 * closed, so `beforeunload` (the recipe in SWR's docs) never fires here.
 *
 * Only data saved by this same build is reused. After an update a screen can
 * expect a field the old build never saved, and reading last week's shape
 * would crash it before the fresh data arrived; one cold start per update is
 * the price of never doing that.
 */
export function persistentCacheProvider(): Cache {
  let entries: [string, unknown][] = [];
  try {
    if (localStorage.getItem(BUILD_KEY) === __BUILD_ID__) {
      entries = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(BUILD_KEY, __BUILD_ID__);
    }
  } catch {
    // Corrupt cache is a cold start, not a crash.
  }
  const map = new Map<string, unknown>(entries);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const scheduleWrite = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...map.entries()]));
      } catch {
        // Quota or serialisation failure just means no warm start next time.
      }
    }, WRITE_DELAY_MS);
  };

  return {
    keys: () => map.keys(),
    get: (key: string) => map.get(key) as ReturnType<Cache["get"]>,
    set: (key: string, value: unknown) => {
      map.set(key, value);
      scheduleWrite();
    },
    delete: (key: string) => {
      map.delete(key);
      scheduleWrite();
    },
  };
}
