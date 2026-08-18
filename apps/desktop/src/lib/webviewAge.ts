import { useEffect, useState } from "react";

/**
 * When the current webview was created.
 *
 * Module scope, so it is stamped once per webview load and survives any React
 * remount. This is the honest way to test M4's "hide, never close" rule: if the
 * popover is being hidden, the age keeps climbing across a dismiss/reopen; if it
 * is being destroyed, a fresh webview stamps a new time and the age drops back
 * to zero.
 */
const LOADED_AT = Date.now();

export function useWebviewAge(): number {
  const [seconds, setSeconds] = useState(() => Math.floor((Date.now() - LOADED_AT) / 1000));

  useEffect(() => {
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - LOADED_AT) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  return seconds;
}
