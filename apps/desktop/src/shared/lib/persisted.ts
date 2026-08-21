import { useEffect, useState } from "react";
import { api } from "./ipc";

export function usePersistedList(
  key: string,
): [string[], (next: string[] | ((current: string[]) => string[])) => void] {
  const [items, setItems] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getSetting<string[]>(key)
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
      api.setSetting(key, resolved).catch(() => {});
      return resolved;
    });
  };

  return [items, update];
}

export function usePersistedString(key: string): [string | null, (next: string | null) => void] {
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSetting<string>(key)
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
    (next === null ? api.deleteSetting(key) : api.setSetting(key, next)).catch(() => {});
  };

  return [value, update];
}
