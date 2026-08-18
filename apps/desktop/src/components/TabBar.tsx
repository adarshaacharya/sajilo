import { NavLink } from "react-router";
import { Icon } from "./Icon";

/**
 * The five destinations that earn permanent space. Everything else is reached
 * from the dashboard.
 *
 * Icons are inline stroke paths — see `Icon`.
 */
const TABS = [
  { to: "/", label: "Today", path: "M3 8.5 8 3.5l5 5M4.5 7.5V13h7V7.5" },
  { to: "/events", label: "Events", path: "M3 4.5h10v8.5H3zM3 7h10M5.5 2.5v2M10.5 2.5v2" },
  { to: "/bazar", label: "Bazar", path: "M3.5 6h9l-1 7.5h-7zM6 6V4a2 2 0 0 1 4 0v2" },
  { to: "/tools", label: "Tools", path: "M9.5 3.5a3 3 0 0 0 3.5 4.2L7.7 13 4 12l-1-3.7 5.3-5.3" },
  {
    to: "/settings",
    label: "Settings",
    path: "M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M12.2 3.8l-1 1M4.8 11.2l-1 1",
  },
] as const;

export function TabBar() {
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
          <span className="text-[10px] leading-none font-medium">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
