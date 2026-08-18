import { NavLink } from "react-router";
import { useEffect, useState } from "react";
import { useSettings } from "../lib/settings";
import * as player from "../lib/audio";
import { Equalizer } from "./Equalizer";
import { type IconName, Icon } from "./Icon";

type LabelKey = Parameters<ReturnType<typeof useSettings>["t"]>[0];

const TABS: readonly {
  to: string;
  labelKey: LabelKey;
  icon: IconName;
  module: "newsEnabled" | "bazarEnabled" | "rashifalEnabled" | "radioEnabled" | null;
}[] = [
  { to: "/", labelKey: "tab.today", icon: "today", module: null },
  { to: "/news", labelKey: "screen.news", icon: "news", module: "newsEnabled" },
  { to: "/bazar", labelKey: "tab.bazar", icon: "bazar", module: "bazarEnabled" },
  { to: "/rashifal", labelKey: "tab.rashifal", icon: "rashifal", module: "rashifalEnabled" },
  { to: "/radio", labelKey: "tab.radio", icon: "radio", module: "radioEnabled" },
  { to: "/tools", labelKey: "tab.tools", icon: "tools", module: null },
];

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
            <Icon name={tab.icon} />
          )}
          <span className="w-full truncate px-0.5 text-center text-[10px] leading-none font-medium">
            {t(tab.labelKey)}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
