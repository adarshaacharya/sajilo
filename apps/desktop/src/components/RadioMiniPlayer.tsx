import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Equalizer } from "./Equalizer";
import { Icon } from "./Icon";
import * as player from "../lib/audio";
import { useSettings } from "../lib/settings";

/**
 * Stays above the tab bar while a station is playing off the Radio screen —
 * same role as Swift `RadioMiniPlayer`.
 */
export function RadioMiniPlayer() {
  const { t } = useSettings();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [state, setState] = useState(player.getState());

  useEffect(() => player.subscribe(setState), []);

  if (!state.nowPlaying || pathname === "/radio") return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border bg-accent/10 px-3 py-1.5">
      <Equalizer isPlaying={state.isPlaying} />
      <button
        type="button"
        onClick={() => navigate("/radio")}
        className="min-w-0 flex-1 text-left"
      >
        <p className="text-[10px] text-text-muted">{t("screen.radio")}</p>
        <p className="truncate text-[12px] font-semibold leading-tight">{state.nowPlaying.name}</p>
      </button>
      <button
        type="button"
        disabled={state.isLoading}
        onClick={() => player.togglePlayback()}
        aria-label={state.isPlaying ? "Pause" : "Play"}
        className="rounded-md p-1.5 text-text-secondary hover:bg-surface-hover hover:text-text disabled:opacity-50"
      >
        {state.isLoading ? (
          <Icon path="M13 3.5v4h-4M13 7.5A5 5 0 1 1 11 4" className="size-3.5 animate-spin" />
        ) : state.isPlaying ? (
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden fill="currentColor">
            <path d="M4 3h3v10H4zm5 0h3v10H9z" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden fill="currentColor">
            <path d="M5 3.2v9.6l8-4.8z" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={() => player.stop()}
        aria-label={t("radio.stop")}
        className="rounded-md p-1.5 text-text-secondary hover:bg-surface-hover hover:text-text"
      >
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden fill="currentColor">
          <path d="M4 4h8v8H4z" />
        </svg>
      </button>
    </div>
  );
}
