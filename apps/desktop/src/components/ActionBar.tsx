import { NavLink } from "react-router";
import { ICONS, Icon } from "./Icon";
import { useSettings } from "../lib/settings";

/**
 * Swift ActionBarView — festivals, news, bazar, rashifal, radio, tools.
 */
export function ActionBar() {
  const { t, modules } = useSettings();

  const items = [
    {
      to: "/news",
      labelKey: "screen.news" as const,
      path: "M3 4h10v6H3zM3 7h10M6 2.5v1.5M10 2.5v1.5",
      show: modules.newsEnabled,
    },
    {
      to: "/bazar",
      labelKey: "screen.bazar" as const,
      path: "M3.5 6h9l-1 7.5h-7zM6 6V4a2 2 0 0 1 4 0v2",
      show: modules.bazarEnabled,
    },
    {
      to: "/rashifal",
      labelKey: "screen.rashifal" as const,
      path: ICONS.rashifal,
      show: modules.rashifalEnabled,
    },
    {
      to: "/radio",
      labelKey: "screen.radio" as const,
      path: ICONS.radio,
      show: modules.radioEnabled,
    },
    {
      to: "/tools",
      labelKey: "screen.tools" as const,
      path: "M9.5 3.5a3 3 0 0 0 3.5 4.2L7.7 13 4 12l-1-3.7 5.3-5.3",
      show: true,
    },
  ].filter((item) => item.show);

  return (
    <nav className="flex shrink-0 gap-0.5 border-t border-border bg-surface/90 px-1.5 py-1.5 backdrop-blur-sm">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 transition-colors ${
              isActive
                ? "bg-surface-hover text-text"
                : "text-text-muted hover:bg-surface-hover/50 hover:text-text-secondary"
            }`
          }
        >
          <Icon path={item.path} className="size-[15px]" />
          <span className="w-full truncate px-0.5 text-center text-[10px] leading-none font-medium">
            {t(item.labelKey)}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
