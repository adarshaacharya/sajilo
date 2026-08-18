import { NavLink } from "react-router";
import { type IconName, Icon } from "./Icon";
import { useSettings } from "../lib/settings";

/**
 * Swift ActionBarView — festivals, news, bazar, rashifal, radio, tools.
 */
export function ActionBar() {
  const { t, modules } = useSettings();

  const items = (
    [
      {
        to: "/news",
        labelKey: "screen.news",
        icon: "news",
        show: modules.newsEnabled,
      },
      {
        to: "/bazar",
        labelKey: "screen.bazar",
        icon: "bazar",
        show: modules.bazarEnabled,
      },
      {
        to: "/rashifal",
        labelKey: "screen.rashifal",
        icon: "rashifal",
        show: modules.rashifalEnabled,
      },
      {
        to: "/radio",
        labelKey: "screen.radio",
        icon: "radio",
        show: modules.radioEnabled,
      },
      {
        to: "/tools",
        labelKey: "screen.tools",
        icon: "tools",
        show: true,
      },
    ] as const satisfies readonly {
      to: string;
      labelKey: Parameters<ReturnType<typeof useSettings>["t"]>[0];
      icon: IconName;
      show: boolean;
    }[]
  ).filter((item) => item.show);

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
          <Icon name={item.icon} className="size-[15px]" />
          <span className="w-full truncate px-0.5 text-center text-[10px] leading-none font-medium">
            {t(item.labelKey)}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
