import { NavLink } from "react-router";
import { useEffect, useState } from "react";
import { useSettings } from "../lib/settings";
import * as player from "../lib/audio";
import { Equalizer } from "./Equalizer";
import { ICONS, Icon } from "./Icon";

const TABS = [
  { to: "/", labelKey: "tab.today", path: "M3 8.5 8 3.5l5 5M4.5 7.5V13h7V7.5", module: null },
  {
    to: "/news",
    labelKey: "screen.news",
    path: "M3 4h10v6H3zM3 7h10M6 2.5v1.5M10 2.5v1.5",
    module: "newsEnabled" as const,
  },
  { to: "/bazar", labelKey: "tab.bazar", path: "M3.5 6h9l-1 7.5h-7zM6 6V4a2 2 0 0 1 4 0v2", module: "bazarEnabled" as const },
  { to: "/rashifal", labelKey: "tab.rashifal", path: ICONS.rashifal, module: "rashifalEnabled" as const },
  { to: "/radio", labelKey: "tab.radio", path: ICONS.radio, module: "radioEnabled" as const },
  {
    to: "/tools",
    labelKey: "tab.tools",
    path: "M9.5 3.5a3 3 0 0 0 3.5 4.2L7.7 13 4 12l-1-3.7 5.3-5.3",
    module: null,
  },
] as const;

export function TabBar() {
  const { t, modules } = useSettings();
  const [radioActive, setRadioActive] = useState(false);
  const [radioPlaying, setRadioPlaying] = useState(false);

  useEffect(
    () =>
      player.subscribe((state) => {
        setRadioActive(Boolean(state.nowPlaying));
        setRadioPlaying(Boolean(state.nowPlaying && state.isPlaying));
      }),
    [],
  );

  const visible = TABS.filter((tab) => !tab.module || modules[tab.module]);

  return (
    <nav className="flex shrink-0 gap-0.5 border-t border-border bg-surface px-1 py-1">
      {visible.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === "/"}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 rounded-md py-1 transition-colors ${
              isActive
                ? "bg-surface-hover text-accent"
                : radioActive && tab.to === "/radio"
                  ? "text-[color:var(--color-accent-mark)]"
                  : "text-text-muted hover:bg-surface-hover/60 hover:text-text-secondary"
            }`
          }
        >
          {radioActive && tab.to === "/radio" ? (
            <Equalizer isPlaying={radioPlaying} />
          ) : (
            <Icon path={tab.path} />
          )}
          <span className="w-full truncate px-0.5 text-center text-[10px] leading-none font-medium">
            {t(tab.labelKey)}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
