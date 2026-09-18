import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Equalizer } from "../../shared/components/equalizer";
import { Icon } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import * as player from "../../shared/lib/audio";
import { spring } from "../../shared/lib/motion";
import { RadioVolumeControl } from "./_components/radio-volume-control";
import { StationArt } from "./_components/station-art";

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

  const visible = Boolean(state.nowPlaying && pathname !== "/radio" && !state.miniPlayerMinimized);
  const station = state.nowPlaying;

  return (
    <AnimatePresence>
      {visible && station && (
        <motion.div
          key="radio-mini"
          initial={{ opacity: 0, y: 12, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: 8, height: 0 }}
          transition={spring.gentle}
          className="radio-mini shrink-0 px-2.5 py-2"
        >
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate("/radio")}
              className="radio-mini-tap flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-surface-hover"
            >
              {/* The equalizer beside it carries playback state, so a logo-less
                  station falls back to the radio glyph rather than a second one. */}
              <StationArt station={station} isPlaying={false} size={28} />
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="flex shrink-0 items-center justify-center">
                  <Equalizer isPlaying={state.isPlaying || state.isLoading} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold leading-tight">
                    {station.name}
                  </span>
                  {station.frequency && (
                    <span className="mt-0.5 block truncate text-[10px] leading-none text-text-muted">
                      {station.frequency}
                    </span>
                  )}
                </span>
              </span>
            </button>

            <RadioVolumeControl className="shrink-0" />

            <div className="flex shrink-0 items-center">
              <button
                type="button"
                disabled={state.isLoading}
                onClick={() => player.togglePlayback()}
                aria-label={state.isPlaying ? "Pause" : "Play"}
                className="icon-btn shrink-0"
              >
                {state.isLoading ? (
                  <Icon name="refresh" className="size-3.5 animate-spin" />
                ) : state.isPlaying ? (
                  <Icon name="pause" className="size-3.5" />
                ) : (
                  <Icon name="play" className="size-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => player.stop()}
                aria-label={t("radio.stop")}
                className="icon-btn shrink-0 text-text-muted hover:text-text-secondary"
              >
                <Icon name="stop" className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => player.minimizeMiniPlayer()}
                aria-label={t("radio.minimize")}
                title={t("radio.minimize")}
                className="icon-btn shrink-0 text-text-muted hover:text-text-secondary"
              >
                <Icon name="chevronDown" className="size-3" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
