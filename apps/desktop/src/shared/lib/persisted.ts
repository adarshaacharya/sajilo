import { useEffect, useState } from "react";

/**
 * Backed by the same `sajilo.json` store Settings uses, so these values are
 * captured by export/import backup instead of living only in this browser
 * profile.
 */
async function loadStore() {
  const { load } = await import("@tauri-apps/plugin-store");
  return load("sajilo.json", { autoSave: true });
}

export function usePersistedList(
  key: string,
): [string[], (next: string[] | ((current: string[]) => string[])) => void] {
  const [items, setItems] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadStore()
      .then((store) => store.get<string[]>(key))
      .then((saved) => {
        if (!cancelled && Array.isArray(saved)) setItems(saved);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  const update = (next: string[] | ((current: string[]) => string[])) => {
    setItems((current) => {
      const resolved =
        typeof next === "function" ? (next as (c: string[]) => string[])(current) : next;
      loadStore()
        .then((store) => store.set(key, resolved))
        .catch(() => {});
      return resolved;
    });
  };

  return [items, update];
}

export function usePersistedString(key: string): [string | null, (next: string | null) => void] {
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStore()
      .then((store) => store.get<string>(key))
      .then((saved) => {
        if (!cancelled && saved) setValue(saved);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  const update = (next: string | null) => {
    setValue(next);
    loadStore()
      .then(async (store) => {
        if (next === null) {
          await store.delete(key);
        } else {
          await store.set(key, next);
        }
      })
      .catch(() => {});
  };

  return [value, update];
}
