import { NavLink } from "react-router";

/** The five destinations that earn permanent space. Everything else is reached
 * from the dashboard. */
const TABS = [
  { to: "/", label: "Today" },
  { to: "/events", label: "Events" },
  { to: "/bazar", label: "Bazar" },
  { to: "/tools", label: "Tools" },
  { to: "/settings", label: "Settings" },
] as const;

export function TabBar() {
  return (
    <nav className="flex shrink-0 border-t border-border">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === "/"}
          className={({ isActive }) =>
            `flex-1 py-2 text-center text-[11px] transition-colors ${
              isActive ? "text-accent" : "text-text-muted hover:text-text-secondary"
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
