import { useEffect, useState } from "react";
import nepalFlag from "../../../src-tauri/assets/nepal-flag.svg";
import { useSettings } from "../context/settings-context";
import { api } from "../lib/ipc";
import { isWindows } from "../lib/platform";
import { Icon } from "./icon";

/** Same key the Rust side reads, so a dismissed card also stops the toast. */
const DISMISSED_KEY = "trayPinTipDismissed";

/**
 * Whether the one-time "keep Sajilo on your taskbar" card should show.
 *
 * Windows 11 hides every new tray icon behind the ^ arrow and gives apps no
 * way to move themselves out, so a new Windows user often cannot find Sajilo
 * at all. Shown until dismissed, on Windows only — the Mac menu bar and Linux
 * panels show the icon where it was put.
 */
export function useTrayPinTip() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isWindows) return;
    let cancelled = false;
    api
      .getSetting<boolean>(DISMISSED_KEY)
      .then((dismissed) => {
        if (!cancelled) setVisible(dismissed !== true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    void api.setSetting(DISMISSED_KEY, true).catch(() => {});
  };

  return { visible, dismiss };
}

/** The card itself: how to drag the flag out of the overflow panel. */
export function TrayPinTip({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useSettings();
  return (
    <section
      className="rounded-[10px] border p-2.5"
      style={{
        borderColor: "color-mix(in srgb, var(--color-accent-mark) 35%, transparent)",
        background: "color-mix(in srgb, var(--color-accent-mark) 8%, transparent)",
      }}
    >
      <div className="flex items-start gap-2">
        <Icon name="pin" className="mt-0.5 size-3 shrink-0 text-[color:var(--color-accent-mark)]" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold leading-snug">{t("tray-pin.title")}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">
            {t("tray-pin.body")}
          </p>

          <PinDiagram />

          <div className="mt-2 flex justify-end">
            <button type="button" onClick={onDismiss} className="settings-btn settings-btn--accent">
              {t("tray-pin.dismiss")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The two places the icon can live, and the drag between them: the overflow
 * panel above the ^ arrow, then the taskbar beside the clock. Drawn from the
 * same flag the tray uses, so what the picture shows is what they will see.
 */
function PinDiagram() {
  const flag = <img src={nepalFlag} alt="" className="h-3 w-auto" />;
  const slot = <span className="size-2.5 rounded-[2px] bg-text-muted/40" />;
  return (
    <div className="mt-2 flex items-end gap-1.5" aria-hidden="true">
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center gap-1 rounded-[4px] border border-[color:var(--color-border)] bg-surface px-1.5 py-1">
          {flag}
          {slot}
          {slot}
        </div>
        <span className="text-[9px] leading-none text-text-muted">^</span>
      </div>

      <svg
        aria-hidden="true"
        viewBox="0 0 40 16"
        className="mb-1 h-4 w-10 shrink-0 text-[color:var(--color-accent-mark)]"
      >
        <path
          d="M2 12 Q 20 0 34 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeDasharray="2.5 2.5"
        />
        <path d="M31 4.5 L35 8.5 L30 10" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 rounded-[4px] border border-[color:var(--color-border)] bg-surface px-1.5 py-1 text-[9px] text-text-muted tabular-nums">
        <span>^</span>
        {flag}
        <span>ENG</span>
        <span>4:34</span>
      </div>
    </div>
  );
}
