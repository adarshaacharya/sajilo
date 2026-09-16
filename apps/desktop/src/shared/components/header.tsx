import { useLocation, useNavigate } from "react-router";
import { useSettings } from "../context/settings-context";
import { BackButton, useGoBack } from "./back-button";
import { useHeaderInnerContent, useHeaderSlotContent } from "./header-slot";
import { Icon } from "./icon";
import { TABS } from "./tab-bar";
import { UpdateHeaderButton } from "./update-header-button";

/**
 * The popover has no title bar of its own — the window is undecorated — and it
 * is deliberately not draggable either. It is anchored under the tray icon, the
 * way a menu-bar popover is: dragging it somewhere else would leave it stranded
 * away from the icon that opens it, and it would still reposition on the next
 * open. No drag region, so it stays put.
 *
 * Settings lives here rather than in the tab bar: it is visited rarely, and a
 * seventh tab would cost every other tab the width its label needs.
 *
 * Back means "up", never browser history: a tab's root has no back button
 * (the tab bar is its navigation), an inner screen a tab opened closes back to
 * that tab, and a pushed page (settings, converter) returns to where it came
 * from — or to Today when the app was opened straight onto it.
 */
export function Header({ title }: { title: string }) {
  const { t } = useSettings();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const goBack = useGoBack();
  const slot = useHeaderSlotContent();
  const inner = useHeaderInnerContent();
  const isTabRoot = TABS.some((tab) => tab.to === pathname);
  const back = inner ? inner.onBack : isTabRoot ? null : goBack;

  return (
    <header className="header-bar flex h-10 shrink-0 items-center gap-1.5 px-2.5">
      {back && <BackButton onClick={back} />}
      <h1 className="min-w-0 flex-1 truncate text-[13px] font-semibold">{inner?.title ?? title}</h1>
      {slot}
      <UpdateHeaderButton />
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
