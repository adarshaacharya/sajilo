/** How often a screen showing NEPSE re-asks while the exchange is trading.
 * The backend fetches the live board at most this often too, so a faster
 * poll would only re-read the cache. */
export const LIVE_REFRESH_MS = 60_000;
