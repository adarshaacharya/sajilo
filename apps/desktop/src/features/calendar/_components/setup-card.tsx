import { useEffect, useRef, useState } from "react";
import { api } from "../../../shared/lib/ipc";
import { track } from "../../../shared/lib/usage";

/** Set by the shell on a brand-new install only, so people who already use
 * Sajilo never see this; cleared by Done. */
const PENDING_KEY = "setupCardPending";

export const SETUP_PREVIEW_SESSION_KEY = "sajilo-preview-setup";
export const SETUP_PREVIEW_EVENT = "sajilo-preview-setup";

/** Asks for the welcome again: it shows next time Today opens. From
 * Settings › About, for anyone who wants to set Sajilo up afresh. */
export function runSetupAgain() {
  return api.setSetting(PENDING_KEY, true);
}

/** Opens the first-run setup on Today without touching install prefs. Dev builds only. */
export function triggerSetupPreview() {
  if (!import.meta.env.DEV) return;
  sessionStorage.setItem(SETUP_PREVIEW_SESSION_KEY, "1");
  window.dispatchEvent(new Event(SETUP_PREVIEW_EVENT));
}

/** Whether the one-time setup card is due, and the way to put it away. */
export function useSetupCard() {
  const [visible, setVisible] = useState(false);
  const previewRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const show = () => {
      if (cancelled) return;
      previewRef.current = true;
      setVisible(true);
    };

    const onPreview = () => show();
    const sessionPreview =
      import.meta.env.DEV && sessionStorage.getItem(SETUP_PREVIEW_SESSION_KEY) === "1";

    if (sessionPreview) {
      show();
    } else {
      api
        .getSetting<boolean>(PENDING_KEY)
        .then((pending) => {
          if (!cancelled) setVisible(pending === true);
        })
        .catch(() => {});
    }

    if (import.meta.env.DEV) {
      window.addEventListener(SETUP_PREVIEW_EVENT, onPreview);
    }

    return () => {
      cancelled = true;
      if (import.meta.env.DEV) {
        window.removeEventListener(SETUP_PREVIEW_EVENT, onPreview);
      }
    };
  }, []);

  const dismiss = () => {
    track("action.setup-done");
    setVisible(false);
    if (previewRef.current) {
      previewRef.current = false;
      sessionStorage.removeItem(SETUP_PREVIEW_SESSION_KEY);
      return;
    }
    void api.deleteSetting(PENDING_KEY).catch(() => {});
  };

  return { visible, dismiss };
}
