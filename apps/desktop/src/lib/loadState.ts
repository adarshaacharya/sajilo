import type { LoadStatus } from "../components/StateBanner";
import type { LoadState } from "../types/api/LoadState";

export function loadBanner<T>(
  state: LoadState<T> | undefined,
  freshnessLabel?: string,
): LoadStatus {
  if (!state) return { status: "loading" };
  switch (state.status) {
    case "stale":
      return { status: "stale", since: freshnessLabel };
    case "failed":
      return { status: "failed", message: state.value };
    case "unavailable":
      return { status: "unavailable" };
    default:
      return { status: state.status };
  }
}

export function loadedValue<T>(state: LoadState<T> | undefined): T | undefined {
  return state && (state.status === "fresh" || state.status === "stale") ? state.value : undefined;
}

export function fetchedAtLabel(freshness: { fetchedAt: string } | undefined): string | undefined {
  if (!freshness) return undefined;
  return new Date(freshness.fetchedAt).toLocaleString();
}

/**
 * A rejected IPC call (dropped connection, a Tauri invoke error) turns into a
 * `failed` `LoadState` instead of an SWR `error`, so every screen keeps
 * reading `LoadState` the same way regardless of where the failure happened —
 * inside the Rust command or on the way to it.
 */
export function catchAsFailed<T>(promise: Promise<LoadState<T>>): Promise<LoadState<T>> {
  return promise.catch(
    (error: unknown): LoadState<T> => ({ status: "failed", value: String(error) }),
  );
}
