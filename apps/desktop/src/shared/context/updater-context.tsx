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
  automaticUpdates: boolean;
  state: UpdateState;
  update: Update | null;
  error: string | null;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<boolean>;
  restartToUpdate: () => Promise<void>;
  setAutomaticUpdates: (enabled: boolean) => void;
}

const UpdaterContext = createContext<Updater | null>(null);
export function UpdaterProvider({
  children,
  handlesAutomaticUpdates = false,
}: {
  children: ReactNode;
  handlesAutomaticUpdates?: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [automaticUpdates, setAutomaticUpdatesState] = useState(true);
  const [state, setState] = useState<UpdateState>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<UpdateState>("idle");
  const automaticUpdatesRef = useRef(true);

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
      if (!next) {
        setState("up-to-date");
      } else if (handlesAutomaticUpdates && automaticUpdatesRef.current) {
        setState("downloading");
        await next.downloadAndInstall();
        setState("installed");
      } else {
        setState("available");
      }
    } catch (checkError) {
      setError(String(checkError));
      setState("failed");
    }
  }, [handlesAutomaticUpdates]);

  const installUpdate = useCallback(async () => {
    if (!update) return false;
    setState("downloading");
    setError(null);
    try {
      await update.downloadAndInstall();
      setState("installed");
      return true;
    } catch (installError) {
      setError(String(installError));
      setState("failed");
      return false;
    }
  }, [update]);

  const restartToUpdate = useCallback(async () => {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  }, []);

  const setAutomaticUpdates = useCallback((next: boolean) => {
    automaticUpdatesRef.current = next;
    setAutomaticUpdatesState(next);
    void api.setSetting("automaticUpdates", next).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    let interval: number | undefined;
    const previewVersion = import.meta.env.DEV
      ? import.meta.env.VITE_SAJILO_UPDATE_PREVIEW
      : undefined;
    if (previewVersion) {
      // Visual QA without a signed updater build. Production replaces this
      // branch at compile time and can only receive a real Update resource.
      setEnabled(true);
      setUpdate({ version: previewVersion } as Update);
      setState("available");
      return;
    }
    Promise.all([api.updaterEnabled(), api.getSetting<boolean>("automaticUpdates")])
      .then(([isEnabled, storedAutomaticUpdates]) => {
        if (cancelled) return;
        const nextAutomaticUpdates = storedAutomaticUpdates ?? true;
        automaticUpdatesRef.current = nextAutomaticUpdates;
        setAutomaticUpdatesState(nextAutomaticUpdates);
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
        automaticUpdates,
        state,
        update,
        error,
        checkForUpdates,
        installUpdate,
        restartToUpdate,
        setAutomaticUpdates,
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
