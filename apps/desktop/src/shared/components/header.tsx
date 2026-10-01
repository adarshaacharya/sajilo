import { useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useSettings } from "../context/settings-context";
import { useDragWhenKept, useKept } from "../lib/popover-kept";
import { tabLayout } from "../lib/tab-layout";
import { BackButton, useGoBack } from "./back-button";
import { useHeaderInnerContent, useHeaderSlotContent } from "./header-slot";
import { Icon } from "./icon";
import { KeepOpenButton } from "./keep-open-button";
import { MiniViewButton } from "./mini-view-button";
import { TABS } from "./tab-bar";
import { UpdateHeaderButton } from "./update-header-button";

/**
 * The popover has no title bar of its own — the window is undecorated. It is
 * anchored under the tray icon, the way a menu-bar popover is, and only moves
 * once the pin keeps it open: then this bar drags it, like a title bar, and it
 * reopens where it was left.
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
  const { t, modules } = useSettings();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const goBack = useGoBack();
  const slot = useHeaderSlotContent();
  const inner = useHeaderInnerContent();
  // Only what's on the tab bar is a root; More is one too. A tab that lives
  // under More was opened from there, so its back arrow returns to More.
  const { bar: onBar, more } = tabLayout(TABS, modules);
  const isTabRoot = pathname === "/more" || onBar.some((tab) => tab.to === pathname);
  const inMore = more.some((tab) => tab.to === pathname);
  const back = inner ? inner.onBack : isTabRoot ? null : inMore ? () => navigate("/more") : goBack;
  const kept = useKept();
  const bar = useRef<HTMLElement>(null);
  useDragWhenKept(bar);

  return (
    <header
      ref={bar}
      className="header-bar flex h-10 shrink-0 items-center gap-1.5 px-2.5"
      data-kept={kept || undefined}
    >
      {back && <BackButton onClick={back} />}
      <h1 className="min-w-0 flex-1 truncate text-[13px] font-semibold">{inner?.title ?? title}</h1>
      {slot}
      <UpdateHeaderButton />
      <MiniViewButton iconClassName="size-3.5" />
      <KeepOpenButton iconClassName="size-3.5" />
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
