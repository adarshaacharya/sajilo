import type { Cache } from "swr";

const STORAGE_KEY = "sajilo-swr-cache";
const WRITE_DELAY_MS = 500;

/**
 * SWR cache backed by localStorage, so a fresh webview paints the last
 * fetched data immediately and revalidates in the background instead of
 * showing a loading placeholder. Without this the cache lives only in
 * memory and dies with the webview on every app restart.
 *
 * Writes are debounced and write-through — a tray app is killed, not
 * closed, so `beforeunload` (the recipe in SWR's docs) never fires here.
 */
export function persistentCacheProvider(): Cache {
  let entries: [string, unknown][] = [];
  try {
    entries = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
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
