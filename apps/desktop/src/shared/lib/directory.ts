import { useEffect, useSyncExternalStore } from "react";
import bundled from "../../../../../data/config/directory.json";
import type { DirectoryPack } from "../../types/api/DirectoryPack";
import { api } from "./ipc";

/* Phone numbers, official sites and keeper templates come from the signed
 * `directory` config pack, so a stale number is fixed without a release.
 * The copy compiled into the app renders first; the installed pack (Rust's,
 * possibly newer) replaces it once read, and again whenever the config
 * changes. */

/** The copy this build ships with. The landing page reads it too. */
export const BUNDLED_DIRECTORY = bundled as DirectoryPack;

let current: DirectoryPack = BUNDLED_DIRECTORY;
let requested = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The directory as of now, for code outside a component. */
export function currentDirectory(): DirectoryPack {
  return current;
}

/** Reads the installed pack from the shell. A failure keeps what's shown. */
export async function refreshDirectory() {
  try {
    const { directory } = await api.configDirectory();
    current = directory;
    for (const listener of listeners) listener();
  } catch {
    // Outside Tauri or mid-restart: the bundled copy is a full answer.
  }
}

/** The directory, re-rendering when a new pack is installed. */
export function useDirectory(): DirectoryPack {
  useEffect(() => {
    if (requested) return;
    requested = true;
    void refreshDirectory();
  }, []);
  return useSyncExternalStore(subscribe, currentDirectory, currentDirectory);
}
