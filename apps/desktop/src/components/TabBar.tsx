import { NavLink } from "react-router";
import { useSettings } from "../lib/settings";
import { ICONS, Icon } from "./Icon";

/**
 * The six destinations that earn permanent space. Settings sits in the header
 * instead: it is visited rarely, and a seventh tab would cost every other tab
 * the width its label needs.
 *
 * Icons are inline stroke paths — see `Icon`.
 */
const TABS = [
  { to: "/", labelKey: "tab.today", path: "M3 8.5 8 3.5l5 5M4.5 7.5V13h7V7.5" },
  { to: "/events", labelKey: "tab.events", path: "M3 4.5h10v8.5H3zM3 7h10M5.5 2.5v2M10.5 2.5v2" },
  { to: "/bazar", labelKey: "tab.bazar", path: "M3.5 6h9l-1 7.5h-7zM6 6V4a2 2 0 0 1 4 0v2" },
  { to: "/rashifal", labelKey: "tab.rashifal", path: ICONS.rashifal },
  { to: "/radio", labelKey: "tab.radio", path: ICONS.radio },
  {
    to: "/tools",
    labelKey: "tab.tools",
    path: "M9.5 3.5a3 3 0 0 0 3.5 4.2L7.7 13 4 12l-1-3.7 5.3-5.3",
  },
] as const;

export function TabBar() {
  const { t } = useSettings();

  return (
    <nav className="flex shrink-0 gap-0.5 border-t border-border bg-surface px-1 py-1">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === "/"}
          className={({ isActive }) =>
            // A pill rather than a coloured label: at 10px, colour alone is a
            // weak active signal, and the fill also gives the tap a target.
            `flex flex-1 flex-col items-center gap-0.5 rounded-md py-1 transition-colors ${
              isActive
                ? "bg-surface-hover text-accent"
                : "text-text-muted hover:bg-surface-hover/60 hover:text-text-secondary"
            }`
          }
        >
          <Icon path={tab.path} />
          <span className="w-full truncate px-0.5 text-center text-[10px] leading-none font-medium">
            {t(tab.labelKey)}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
