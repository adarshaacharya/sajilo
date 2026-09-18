/**
 * One `<audio>` element for the whole app.
 *
 * Created against `document` rather than rendered by a component, and
 * deliberately never unmounted: the radio has to keep playing while the user
 * navigates to another screen, and — the harder case — while the popover is
 * dismissed entirely. A React-owned element inside a route would be torn down
 * on both.
 *
 * This is why the window is hidden rather than closed (see `window.rs`). Hiding
 * keeps the webview, and the webview keeps this element and its socket.
 *
 * State is stashed on `globalThis` so Vite HMR does not wipe "now playing"
 * while the stream is still audible.
 */

export interface NowPlaying {
  slug: string;
  name: string;
  frequency?: string | null;
  logoUrl?: string | null;
}

type Listener = (state: PlayerState) => void;

export interface PlayerState {
  nowPlaying: NowPlaying | null;
  /** True between a play request and the first audio actually arriving. */
  isLoading: boolean;
  /** True when audio is actively playing (not paused / stopped). */
  isPlaying: boolean;
  error: string | null;
  /** Output level, 0–1. Persisted in the webview. */
  volume: number;
  /**
   * The listener tucked the mini player away but kept the stream playing.
   * Cleared by stop and by tuning to a different station, so the bar comes
   * back whenever there is something new to show. Not persisted: radio never
   * auto-plays on launch, so there is nothing to restore it against.
   */
  miniPlayerMinimized: boolean;
}

type AudioBag = {
  element: HTMLAudioElement | null;
  state: PlayerState;
  listeners: Set<Listener>;
  volumeBeforeMute: number;
};

const VOLUME_KEY = "sajiloRadioVolume";
const DEFAULT_VOLUME = 1;

function readStoredVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw == null) return DEFAULT_VOLUME;
    const value = Number(raw);
    if (!Number.isFinite(value)) return DEFAULT_VOLUME;
    return Math.min(1, Math.max(0, value));
  } catch {
    return DEFAULT_VOLUME;
  }
}

function writeStoredVolume(volume: number) {
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function applyVolume(volume: number) {
  const clamped = Math.min(1, Math.max(0, volume));
  if (bag.element) bag.element.volume = clamped;
  return clamped;
}

const bag: AudioBag = (() => {
  const key = "__sajiloRadio";
  const g = globalThis as unknown as Record<string, AudioBag | undefined>;
  const existing = g[key];
  if (existing) return existing;

  const volume = readStoredVolume();
  const created: AudioBag = {
    element: null,
    state: {
      nowPlaying: null,
      isLoading: false,
      isPlaying: false,
      error: null,
      volume,
      miniPlayerMinimized: false,
    },
    listeners: new Set(),
    volumeBeforeMute: volume > 0 ? volume : DEFAULT_VOLUME,
  };
  g[key] = created;
  return created;
})();

function publish(next: Partial<PlayerState>) {
  bag.state = { ...bag.state, ...next };
  for (const listener of bag.listeners) listener(bag.state);
}

function syncFromElement() {
  const el = bag.element;
  if (!el?.src) {
    publish({ isPlaying: false, isLoading: false });
    return;
  }
  publish({
    isPlaying: !el.paused,
    isLoading: !el.paused && el.readyState < 3,
  });
}

function audio(): HTMLAudioElement {
  if (bag.element) return bag.element;

  const el = document.createElement("audio");
  // Streams are live; there is nothing to seek and nothing worth buffering
  // ahead of the listener.
  el.preload = "none";
  el.addEventListener("playing", () => publish({ isLoading: false, isPlaying: true, error: null }));
  el.addEventListener("pause", () => publish({ isPlaying: false, isLoading: false }));
  el.addEventListener("waiting", () => publish({ isLoading: true }));
  el.addEventListener("error", () =>
    publish({ isLoading: false, isPlaying: false, error: "Could not play this station" }),
  );
  el.volume = bag.state.volume;
  bag.element = el;
  return el;
}

export function subscribe(listener: Listener): () => void {
  bag.listeners.add(listener);
  // Re-sync from the live element in case HMR restored module code while
  // audio was already running.
  syncFromElement();
  listener(bag.state);
  return () => bag.listeners.delete(listener);
}

export function getState(): PlayerState {
  return bag.state;
}

/**
 * Starts a stream. Must be called from a user gesture — every browser engine
 * refuses to begin audio otherwise, and Sajilo has no autoplay path by design.
 */
export function play(station: NowPlaying, streamUrl: string) {
  const el = audio();
  if (el.src !== streamUrl) {
    el.src = streamUrl;
  }
  const retuned = bag.state.nowPlaying?.slug !== station.slug;
  publish({
    nowPlaying: station,
    isLoading: true,
    isPlaying: false,
    error: null,
    miniPlayerMinimized: retuned ? false : bag.state.miniPlayerMinimized,
  });
  el.play().catch(() =>
    publish({ isLoading: false, isPlaying: false, error: "Playback was blocked" }),
  );
}

export function pause() {
  audio().pause();
  publish({ isLoading: false, isPlaying: false });
}

export function resume() {
  const el = audio();
  if (!el.src) return;
  publish({ isLoading: true });
  el.play().catch(() =>
    publish({ isLoading: false, isPlaying: false, error: "Playback was blocked" }),
  );
}

/**
 * Stops and releases the stream.
 *
 * `src` is cleared as well as paused: a paused live stream can keep its socket
 * open and go on consuming data the listener is not hearing.
 */
export function stop() {
  const el = audio();
  el.pause();
  el.removeAttribute("src");
  el.load();
  publish({
    nowPlaying: null,
    isLoading: false,
    isPlaying: false,
    error: null,
    miniPlayerMinimized: false,
  });
}

export function isPaused(): boolean {
  return bag.element?.paused ?? true;
}

export function togglePlayback() {
  if (!bag.state.nowPlaying) return;
  if (isPaused()) resume();
  else pause();
}

export function setVolume(volume: number) {
  const clamped = applyVolume(volume);
  writeStoredVolume(clamped);
  if (clamped > 0) bag.volumeBeforeMute = clamped;
  publish({ volume: clamped });
}

export function toggleMute() {
  if (bag.state.volume > 0) {
    bag.volumeBeforeMute = bag.state.volume;
    setVolume(0);
    return;
  }
  setVolume(bag.volumeBeforeMute > 0 ? bag.volumeBeforeMute : DEFAULT_VOLUME);
}

/** Hides the mini player without touching playback. */
export function minimizeMiniPlayer() {
  if (!bag.state.nowPlaying) return;
  publish({ miniPlayerMinimized: true });
}
