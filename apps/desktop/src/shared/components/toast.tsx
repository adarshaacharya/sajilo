import { useEffect } from "react";

/** A short line at the foot of the screen, with at most one action (Undo,
 * Open). */
export type Toast = { text: string; action?: { label: string; run: () => void } };

const SHOWN_MS = 3200;

export function ToastBar({ toast, onDone }: { toast: Toast | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDone, SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [toast, onDone]);

  if (!toast) return null;
  return (
    <div className="app-toast" role="status">
      <span className="min-w-0 flex-1">{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          className="app-toast__action"
          onClick={() => {
            toast.action?.run();
            onDone();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
