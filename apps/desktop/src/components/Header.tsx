import { useLocation, useNavigate } from "react-router";
import { useSettings } from "../lib/settings";
import { Icon } from "./Icon";

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
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const canGoBack = pathname !== "/";

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
      {canGoBack && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t("action.back")}
          className="rounded-lg px-1.5 py-0.5 text-text-secondary hover:bg-surface-hover hover:text-text"
        >
          ‹
        </button>
      )}
      <h1 className="flex-1 truncate text-sm font-semibold">{title}</h1>
      {pathname !== "/settings" && (
        <button
          type="button"
          onClick={() => navigate("/settings")}
          aria-label={t("screen.settings")}
          className="shrink-0 rounded-lg p-1 text-text-muted hover:bg-surface-hover hover:text-text"
        >
          <Icon name="settings" />
        </button>
      )}
    </header>
  );
}
