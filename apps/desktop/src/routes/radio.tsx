import { useEffect, useState } from "react";
import { Card } from "../components/Card";
import { type LoadStatus, StateBanner } from "../components/StateBanner";
import * as player from "../lib/audio";
import { useSettings } from "../lib/settings";

export function Radio() {
  const { t } = useSettings();
  const [state, setState] = useState<player.PlayerState>(player.getState());
  // The directory comes from the server. Until the API client lands the screen
  // says so, rather than showing an empty list that looks like Nepal has no
  // radio stations.
  const [directory] = useState<LoadStatus>({ status: "unavailable" });

  useEffect(() => player.subscribe(setState), []);

  return (
    <div className="space-y-3">
      {state.nowPlaying && (
        // Pinned above the list so the playing station stays reachable while
        // scrolling, and survives navigating away entirely.
        <Card title={t("radio.now-playing")}>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{state.nowPlaying.name}</span>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => (player.isPaused() ? player.resume() : player.pause())}
                className="rounded-md border border-border px-2 py-0.5 text-text-secondary hover:bg-surface-hover hover:text-text"
              >
                {player.isPaused() ? "▶" : "❚❚"}
              </button>
              <button
                type="button"
                onClick={player.stop}
                aria-label={t("radio.stop")}
                className="rounded-md border border-border px-2 py-0.5 text-text-secondary hover:bg-surface-hover hover:text-text"
              >
                ■
              </button>
            </div>
          </div>
          {state.isLoading && <p className="mt-1 text-[11px] text-text-muted">…</p>}
          {state.error && <p className="mt-1 text-[11px] text-holiday">{state.error}</p>}
        </Card>
      )}

      <Card title={t("radio.stations")}>
        <StateBanner state={directory} />
      </Card>
    </div>
  );
}
