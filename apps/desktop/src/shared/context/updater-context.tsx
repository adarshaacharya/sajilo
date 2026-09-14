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
  /** The version on offer, once a check has found one. */
  version: string | null;
  error: string | null;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<boolean>;
  restartToUpdate: () => Promise<void>;
  setAutomaticUpdates: (enabled: boolean) => void;
}

/** What the checking window broadcasts and every other window mirrors. */
interface UpdaterSnapshot {
  state: UpdateState;
  version: string | null;
  error: string | null;
  automaticUpdates: boolean;
}

type UpdaterRequest =
  | { action: "snapshot" }
  | { action: "check" }
  | { action: "install" }
  | { action: "automatic"; enabled: boolean };

const STATE_EVENT = "sajilo://updater-state";
const REQUEST_EVENT = "sajilo://updater-request";
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** While one of these holds, another check would only repeat what is known. */
const SETTLED: readonly UpdateState[] = ["checking", "available", "downloading", "installed"];

async function send(event: string, payload: UpdaterSnapshot | UpdaterRequest) {
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(event, payload);
  } catch {
    // Outside Tauri (the landing-page showcase) there is no other window.
  }
}

/** Subscribes to a Tauri event for as long as `active`, always calling the latest handler. */
function useTauriEvent<T>(event: string, active: boolean, handler: (payload: T) => void) {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!active) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    import("@tauri-apps/api/event")
      .then(({ listen }) => listen<T>(event, (message) => latest.current(message.payload)))
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [event, active]);
}

const UpdaterContext = createContext<Updater | null>(null);

/**
 * Only one window talks to the update server.
 *
 * The update window is the `owner`: it checks at launch and hourly, holds the
 * downloaded update, and installs it — and broadcasts its state after every
 * change. The popover is a `mirror` of that state; its Settings buttons send a
 * request to the owner instead of running a second, unrelated check that the
 * update window would never hear about.
 */
export function UpdaterProvider({
  children,
  mode,
}: {
  children: ReactNode;
  mode: "owner" | "mirror";
}) {
  const owner = mode === "owner";
  const [enabled, setEnabled] = useState(false);
  const [automaticUpdates, setAutomaticUpdatesState] = useState(true);
  const [state, setState] = useState<UpdateState>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const update = useRef<Update | null>(null);
  const stateRef = useRef<UpdateState>("idle");
  const automaticUpdatesRef = useRef(true);
  const installWaiter = useRef<((installed: boolean) => void) | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ---- owner: the only window that checks, downloads and installs

  const runCheck = useCallback(async () => {
    setState("checking");
    setError(null);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const next = await check();
      update.current = next;
      setVersion(next?.version ?? null);
      if (!next) {
        setState("up-to-date");
      } else if (automaticUpdatesRef.current) {
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
  }, []);

  const runInstall = useCallback(async () => {
    const pending = update.current;
    if (!pending) return false;
    setState("downloading");
    setError(null);
    try {
      await pending.downloadAndInstall();
      setState("installed");
      return true;
    } catch (installError) {
      setError(String(installError));
      setState("failed");
      return false;
    }
  }, []);

  useEffect(() => {
    if (owner) void send(STATE_EVENT, { state, version, error, automaticUpdates });
  }, [owner, state, version, error, automaticUpdates]);

  useTauriEvent<UpdaterRequest>(REQUEST_EVENT, owner, (request) => {
    switch (request.action) {
      case "snapshot":
        void send(STATE_EVENT, { state, version, error, automaticUpdates });
        break;
      case "check":
        if (!SETTLED.includes(stateRef.current)) void runCheck();
        break;
      case "install":
        void runInstall();
        break;
      case "automatic":
        automaticUpdatesRef.current = request.enabled;
        setAutomaticUpdatesState(request.enabled);
        break;
    }
  });

  // ---- mirror: shows the owner's state and forwards what the user asks for

  useTauriEvent<UpdaterSnapshot>(STATE_EVENT, !owner, (snapshot) => {
    setState(snapshot.state);
    setVersion(snapshot.version);
    setError(snapshot.error);
    automaticUpdatesRef.current = snapshot.automaticUpdates;
    setAutomaticUpdatesState(snapshot.automaticUpdates);
    if (snapshot.state === "installed" || snapshot.state === "failed") {
      installWaiter.current?.(snapshot.state === "installed");
      installWaiter.current = null;
    }
  });

  // ---- shared

  const checkForUpdates = useCallback(async () => {
    if (owner) await runCheck();
    else await send(REQUEST_EVENT, { action: "check" });
  }, [owner, runCheck]);

  const installUpdate = useCallback(async () => {
    if (owner) return runInstall();
    return new Promise<boolean>((resolve) => {
      installWaiter.current = resolve;
      void send(REQUEST_EVENT, { action: "install" });
    });
  }, [owner, runInstall]);

  const restartToUpdate = useCallback(async () => {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  }, []);

  const setAutomaticUpdates = useCallback(
    (next: boolean) => {
      automaticUpdatesRef.current = next;
      setAutomaticUpdatesState(next);
      void api.setSetting("automaticUpdates", next).catch(() => {});
      if (!owner) void send(REQUEST_EVENT, { action: "automatic", enabled: next });
    },
    [owner],
  );

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
      setVersion(previewVersion);
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
        if (!owner) {
          // Catch up on anything the owner found before this window loaded.
          void send(REQUEST_EVENT, { action: "snapshot" });
          return;
        }
        void runCheck();
        interval = window.setInterval(() => {
          if (!SETTLED.includes(stateRef.current)) void runCheck();
        }, CHECK_INTERVAL_MS);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [owner, runCheck]);

  return (
    <UpdaterContext.Provider
      value={{
        enabled,
        automaticUpdates,
        state,
        version,
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
