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
 */

export interface NowPlaying {
  slug: string;
  name: string;
  frequency?: string | null;
}

type Listener = (state: PlayerState) => void;

export interface PlayerState {
  nowPlaying: NowPlaying | null;
  /** True between a play request and the first audio actually arriving. */
  isLoading: boolean;
  /** True when audio is actively playing (not paused / stopped). */
  isPlaying: boolean;
  error: string | null;
}

let element: HTMLAudioElement | null = null;
let state: PlayerState = {
  nowPlaying: null,
  isLoading: false,
  isPlaying: false,
  error: null,
};
const listeners = new Set<Listener>();

function publish(next: Partial<PlayerState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener(state);
}

function syncPlaying() {
  const player = element;
  if (!player) return;
  publish({
    isPlaying: Boolean(!player.paused && player.src),
  });
}

function audio(): HTMLAudioElement {
  if (element) return element;

  element = document.createElement("audio");
  // Streams are live; there is nothing to seek and nothing worth buffering
  // ahead of the listener.
  element.preload = "none";
  element.addEventListener("playing", () =>
    publish({ isLoading: false, isPlaying: true, error: null }),
  );
  element.addEventListener("pause", () => publish({ isPlaying: false, isLoading: false }));
  element.addEventListener("waiting", () => publish({ isLoading: true }));
  element.addEventListener("error", () =>
    // A station that has gone off air is the common case, not a bug — so it is
    // reported in place rather than thrown.
    publish({ isLoading: false, isPlaying: false, error: "Could not play this station" }),
  );
  return element;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function getState(): PlayerState {
  return state;
}

/**
 * Starts a stream. Must be called from a user gesture — every browser engine
 * refuses to begin audio otherwise, and Sajilo has no autoplay path by design.
 */
export function play(station: NowPlaying, streamUrl: string) {
  const player = audio();
  if (player.src !== streamUrl) {
    player.src = streamUrl;
  }
  publish({ nowPlaying: station, isLoading: true, isPlaying: false, error: null });
  player.play().catch(() => publish({ isLoading: false, isPlaying: false, error: "Playback was blocked" }));
}

export function pause() {
  audio().pause();
  publish({ isLoading: false, isPlaying: false });
}

export function resume() {
  const player = audio();
  if (!player.src) return;
  publish({ isLoading: true });
  player.play().catch(() => publish({ isLoading: false, isPlaying: false, error: "Playback was blocked" }));
}

/**
 * Stops and releases the stream.
 *
 * `src` is cleared as well as paused: a paused live stream can keep its socket
 * open and go on consuming data the listener is not hearing.
 */
export function stop() {
  const player = audio();
  player.pause();
  player.removeAttribute("src");
  player.load();
  publish({ nowPlaying: null, isLoading: false, isPlaying: false, error: null });
}

export function isPaused(): boolean {
  return element?.paused ?? true;
}

export function togglePlayback() {
  if (!state.nowPlaying) return;
  if (isPaused()) resume();
  else pause();
  syncPlaying();
}
