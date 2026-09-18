import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { useSettings } from "../context/settings-context";
import * as player from "../lib/audio";
import { spring } from "../lib/motion";
import { Equalizer } from "./equalizer";
import { Icon, type IconName } from "./icon";

type LabelKey = Parameters<ReturnType<typeof useSettings>["t"]>[0];

export const TABS: readonly {
  to: string;
  labelKey: LabelKey;
  icon: IconName;
  module:
    | "newsEnabled"
    | "bazarEnabled"
    | "rashifalEnabled"
    | "radioEnabled"
    | "keeperEnabled"
    | null;
}[] = [
  { to: "/", labelKey: "tab.today", icon: "today", module: null },
  { to: "/news", labelKey: "screen.news", icon: "news", module: "newsEnabled" },
  { to: "/bazar", labelKey: "tab.bazar", icon: "bazar", module: "bazarEnabled" },
  { to: "/rashifal", labelKey: "tab.rashifal", icon: "rashifal", module: "rashifalEnabled" },
  { to: "/radio", labelKey: "tab.radio", icon: "radio", module: "radioEnabled" },
  { to: "/tools", labelKey: "tab.tools", icon: "tools", module: null },
  { to: "/keeper", labelKey: "tab.keeper", icon: "keeper", module: "keeperEnabled" },
];

export function TabBar() {
  const { t, modules } = useSettings();
  const { pathname } = useLocation();
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [radioMinimized, setRadioMinimized] = useState(false);
  // With the mini player tucked away, the tab is the only sign a station is
  // loaded — so it takes over the equalizer. Still bars mean paused.
  const radioInTab = radioMinimized && pathname !== "/radio";

  useEffect(
    () =>
      player.subscribe((state) => {
        setRadioPlaying(Boolean(state.nowPlaying && state.isPlaying));
        setRadioMinimized(Boolean(state.nowPlaying && state.miniPlayerMinimized));
      }),
    [],
  );

  const visible = TABS.filter((tab) => !tab.module || modules[tab.module]);

  return (
    <nav className="tab-bar flex shrink-0 gap-0.5 px-1 py-1">
      {visible.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === "/"}
          className="tab-link flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1"
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="tab-pill"
                  className="tab-indicator"
                  transition={spring.tab}
                />
              )}
              <span
                className={`relative z-[1] flex flex-col items-center gap-0.5 transition-colors duration-200 ${
                  isActive
                    ? "text-[color:var(--color-accent-mark)]"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {tab.to === "/radio" && radioInTab ? (
                  <span className="flex size-4 items-center justify-center">
                    <Equalizer isPlaying={radioPlaying} />
                  </span>
                ) : (
                  <Icon name={tab.icon} />
                )}
                <span className="w-full truncate px-0.5 text-center text-[10px] leading-none font-medium">
                  {t(tab.labelKey)}
                </span>
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
