import type { Update } from "@tauri-apps/plugin-updater";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "../lib/ipc";

export type UpdateState =
  | "idle"
  | "checking"
  | "available"
  | "up-to-date"
  | "downloading"
  | "installed"
  | "failed";

interface Updater {
  enabled: boolean;
  state: UpdateState;
  update: Update | null;
  error: string | null;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  restartToUpdate: () => Promise<void>;
}

const UpdaterContext = createContext<Updater | null>(null);

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<UpdateState>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<UpdateState>("idle");

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const checkForUpdates = useCallback(async () => {
    setState("checking");
    setError(null);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const next = await check();
      setUpdate(next);
      setState(next ? "available" : "up-to-date");
    } catch (checkError) {
      setError(String(checkError));
      setState("failed");
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (!update) return;
    setState("downloading");
    setError(null);
    try {
      await update.downloadAndInstall();
      setState("installed");
    } catch (installError) {
      setError(String(installError));
      setState("failed");
    }
  }, [update]);

  const restartToUpdate = useCallback(async () => {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let interval: number | undefined;
    api
      .updaterEnabled()
      .then((isEnabled) => {
        if (cancelled) return;
        setEnabled(isEnabled);
        if (!isEnabled) return;
        void checkForUpdates();
        interval = window.setInterval(
          () => {
            if (!["available", "downloading", "installed"].includes(stateRef.current)) {
              void checkForUpdates();
            }
          },
          60 * 60 * 1000,
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [checkForUpdates]);

  return (
    <UpdaterContext.Provider
      value={{
        enabled,
        state,
        update,
        error,
        checkForUpdates,
        installUpdate,
        restartToUpdate,
      }}
    >
      {children}
    </UpdaterContext.Provider>
  );
}

export function useUpdater(): Updater {
  const value = useContext(UpdaterContext);
  if (!value) throw new Error("useUpdater must be used inside UpdaterProvider");
  return value;
}
