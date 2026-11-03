import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { openExternalLink } from "../lib/external-link";
import { api, type UpdateInstallKind } from "../lib/ipc";
import { isWindows } from "../lib/platform";

export type UpdateState =
  | "idle"
  | "checking"
  | "available"
  | "up-to-date"
  | "downloading"
  | "installed"
  | "failed";

/** Where a person updates by hand when the app can't install it itself. */
export const DOWNLOAD_URL = "https://sajilo.fyi/download.html";

/** The `error` of an update that stopped moving, rather than one that failed. */
export const STALLED = "stalled";

/** How much of the update has come down, in bytes; `total` when the server said. */
export interface UpdateProgress {
  done: number;
  total: number | null;
}

interface Updater {
  enabled: boolean;
  /** How this copy updates; see `UpdateInstallKind`. */
  installKind: UpdateInstallKind;
  state: UpdateState;
  /** The version on offer, once a check has found one. */
  version: string | null;
  /** While downloading; null before the first byte and once it is in. */
  progress: UpdateProgress | null;
  error: string | null;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<boolean>;
  restartToUpdate: () => Promise<void>;
}

/** What the checking window broadcasts and every other window mirrors. */
interface UpdaterSnapshot {
  state: UpdateState;
  version: string | null;
  progress: UpdateProgress | null;
  error: string | null;
}

type UpdaterRequest = { action: "snapshot" } | { action: "check" } | { action: "install" };

const STATE_EVENT = "sajilo://updater-state";
const REQUEST_EVENT = "sajilo://updater-request";
/** From the shell: nobody's around, so a downloaded update can install now. */
const INSTALL_NOW_EVENT = "sajilo://updater-install-now";
/** A check is one fetch of the release's `latest.json` (about a kilobyte) from
 * GitHub's release CDN — not the rate-limited REST API — so half-hourly costs
 * nothing noticeable and gets a fix to people within the half hour. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** While one of these holds, another check would only repeat what is known. */
const SETTLED: readonly UpdateState[] = ["checking", "available", "downloading", "installed"];
/** A download or install that shows no sign of life for this long is called
 * stuck, so the user is offered the download page instead of a spinner that
 * may never stop: a hidden password prompt, a VPN eating the connection, or a
 * copy macOS runs read-only from the disk image. */
const STALL_MS = 2 * 60 * 1000;
const STALL_CHECK_MS = 5 * 1000;
/** Without a total, progress is told in steps of this many bytes. */
const PROGRESS_STEP = 256 * 1024;

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
  const [installKind, setInstallKind] = useState<UpdateInstallKind>("auto");
  const installKindRef = useRef<UpdateInstallKind>("auto");
  const [state, setState] = useState<UpdateState>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const update = useRef<Update | null>(null);
  /** Windows: downloaded, waiting for a quiet moment to install. */
  const downloaded = useRef(false);
  const stateRef = useRef<UpdateState>("idle");
  const installWaiter = useRef<((installed: boolean) => void) | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ---- owner: the only window that checks, downloads and installs

  /**
   * Runs a download or install, reporting its progress and watching that it
   * keeps moving. A stall is reported as failed with `STALLED`; the work
   * itself can't be cancelled, so if it does finish later, the caller still
   * gets to say so.
   */
  const watched = useCallback(
    async (run: (onEvent: (event: DownloadEvent) => void) => Promise<void>) => {
      let done = 0;
      let total: number | null = null;
      let step = -1;
      let lastSign = Date.now();
      const watchdog = window.setInterval(() => {
        if (Date.now() - lastSign < STALL_MS) return;
        window.clearInterval(watchdog);
        setError(STALLED);
        setState("failed");
      }, STALL_CHECK_MS);
      try {
        await run((event) => {
          lastSign = Date.now();
          if (event.event === "Started") {
            total = event.data.contentLength || null;
          } else if (event.event === "Progress") {
            done += event.data.chunkLength;
          } else {
            setProgress(null);
            return;
          }
          // A chunk is a few kilobytes; every window re-renders on a change,
          // so only a whole percent (or step) is worth telling.
          const next = total ? Math.floor((done * 100) / total) : Math.floor(done / PROGRESS_STEP);
          if (next === step) return;
          step = next;
          setProgress({ done, total });
        });
      } finally {
        window.clearInterval(watchdog);
        setProgress(null);
      }
    },
    [],
  );

  const runCheck = useCallback(async () => {
    setState("checking");
    setError(null);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const next = await check();
      update.current = next;
      downloaded.current = false;
      setVersion(next?.version ?? null);
      if (!next) {
        setState("up-to-date");
      } else if (installKindRef.current === "auto") {
        // Wherever installing is quiet, it just happens: nobody is asked.
        // A Linux package would pop a password prompt out of nowhere, so it
        // waits for a click.
        setState("downloading");
        if (isWindows) {
          // Windows' installer closes the app as it starts, so only download
          // now; the shell asks for the install once nobody's around.
          await watched((onEvent) => next.download(onEvent));
          downloaded.current = true;
          setState("available");
          void api.updateDownloaded().catch(() => {});
        } else {
          await watched((onEvent) => next.downloadAndInstall(onEvent));
          setState("installed");
          void api.updateInstalled().catch(() => {});
        }
      } else {
        setState("available");
      }
    } catch (checkError) {
      setError(String(checkError));
      setState("failed");
    }
  }, [watched]);

  const runInstall = useCallback(async () => {
    const pending = update.current;
    if (!pending) return false;
    if (installKindRef.current === "manual") {
      openExternalLink(DOWNLOAD_URL);
      return false;
    }
    setState("downloading");
    setError(null);
    try {
      if (downloaded.current) await watched(() => pending.install());
      else await watched((onEvent) => pending.downloadAndInstall(onEvent));
      setState("installed");
      void api.updateInstalled().catch(() => {});
      return true;
    } catch (installError) {
      setError(String(installError));
      setState("failed");
      return false;
    }
  }, [watched]);

  useEffect(() => {
    if (owner) void send(STATE_EVENT, { state, version, progress, error });
  }, [owner, state, version, progress, error]);

  useTauriEvent<UpdaterRequest>(REQUEST_EVENT, owner, (request) => {
    switch (request.action) {
      case "snapshot":
        void send(STATE_EVENT, { state, version, progress, error });
        break;
      case "check":
        if (!SETTLED.includes(stateRef.current)) void runCheck();
        break;
      case "install":
        void runInstall();
        break;
    }
  });

  useTauriEvent<null>(INSTALL_NOW_EVENT, owner, () => {
    if (downloaded.current) void runInstall();
  });

  // ---- mirror: shows the owner's state and forwards what the user asks for

  useTauriEvent<UpdaterSnapshot>(STATE_EVENT, !owner, (snapshot) => {
    setState(snapshot.state);
    setVersion(snapshot.version);
    setProgress(snapshot.progress ?? null);
    setError(snapshot.error);
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
    Promise.all([
      api.updaterEnabled(),
      api.updateInstallKind().catch((): UpdateInstallKind => "auto"),
    ])
      .then(([isEnabled, kind]) => {
        if (cancelled) return;
        installKindRef.current = kind;
        setInstallKind(kind);
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
        installKind,
        state,
        version,
        progress,
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
