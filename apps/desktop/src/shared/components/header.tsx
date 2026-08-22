import { useLocation, useNavigate } from "react-router";
import { useSettings } from "../context/settings-context";
import { useUpdater } from "../context/updater-context";
import { useHeaderSlotContent } from "./header-slot";
import { Icon } from "./icon";

/**
 * The popover has no title bar of its own — the window is undecorated — and it
 * is deliberately not draggable either. It is anchored under the tray icon, the
 * way a menu-bar popover is: dragging it somewhere else would leave it stranded
 * away from the icon that opens it, and it would still reposition on the next
 * open. No drag region, so it stays put.
 *
 * Settings lives here rather than in the tab bar: it is visited rarely, and a
 * seventh tab would cost every other tab the width its label needs.
 */
export function Header({ title }: { title: string }) {
  const { t } = useSettings();
  const { state: updateState, update, installUpdate, restartToUpdate } = useUpdater();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const slot = useHeaderSlotContent();
  const canGoBack = pathname !== "/";

  return (
    <header className="header-bar flex h-10 shrink-0 items-center gap-1.5 px-2.5">
      {canGoBack && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t("action.back")}
          className="icon-btn"
        >
          <Icon name="chevronLeft" className="size-3.5" />
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate text-[13px] font-semibold">{title}</h1>
      {slot}
      {updateState === "available" && update && (
        <button
          type="button"
          onClick={() => installUpdate()}
          aria-label={`${t("action.update-available")} ${update.version}`}
          title={`${t("action.update-available")} ${update.version}`}
          className="icon-btn update-btn shrink-0"
        >
          <Icon name="refresh" className="size-3.5" />
          <span className="update-dot" aria-hidden="true" />
        </button>
      )}
      {updateState === "installed" && (
        <button
          type="button"
          onClick={() => restartToUpdate()}
          aria-label={t("action.restart-update")}
          title={t("action.restart-update")}
          className="icon-btn update-btn shrink-0"
        >
          <Icon name="refresh" className="size-3.5" />
        </button>
      )}
      {pathname !== "/settings" && (
        <button
          type="button"
          onClick={() => navigate("/settings")}
          aria-label={t("screen.settings")}
          className="icon-btn shrink-0"
        >
          <Icon name="settings" className="size-3.5" />
        </button>
      )}
    </header>
  );
}
