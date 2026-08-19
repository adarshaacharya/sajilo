import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Equalizer } from "../../shared/components/equalizer";
import { Icon } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import * as player from "../../shared/lib/audio";
import { spring } from "../../shared/lib/motion";

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

  const visible = Boolean(state.nowPlaying && pathname !== "/radio");

  return (
    <AnimatePresence>
      {visible && state.nowPlaying && (
        <motion.div
          key="radio-mini"
          initial={{ opacity: 0, y: 12, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: 8, height: 0 }}
          transition={spring.gentle}
          className="flex shrink-0 items-center gap-2 overflow-hidden px-3 py-1.5"
          style={{
            borderTop: "1px solid var(--color-divider)",
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--color-accent-mark) 12%, transparent), transparent 70%)",
            backdropFilter: "blur(12px)",
          }}
        >
          <Equalizer isPlaying={state.isPlaying} />
          <button
            type="button"
            onClick={() => navigate("/radio")}
            className="min-w-0 flex-1 text-left"
          >
            <p className="text-[10px] text-text-muted">{t("screen.radio")}</p>
            <p className="truncate text-[12px] font-semibold leading-tight">
              {state.nowPlaying.name}
            </p>
          </button>
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
            className="icon-btn shrink-0"
          >
            <Icon name="stop" className="size-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
