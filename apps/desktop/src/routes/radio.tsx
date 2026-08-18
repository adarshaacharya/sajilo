import { useCallback, useEffect, useState } from "react";
import { Card } from "../components/Card";
import { ICONS, Icon } from "../components/Icon";
import { type LoadStatus, StateBanner } from "../components/StateBanner";
import * as player from "../lib/audio";
import { api } from "../lib/ipc";
import { useSettings } from "../lib/settings";
import type { LoadState } from "../types/api/LoadState";
import type { RadioDirectory } from "../types/api/RadioDirectory";

function banner(state: LoadState<RadioDirectory> | undefined): LoadStatus {
  if (!state) return { status: "loading" };
  switch (state.status) {
    case "stale":
      return { status: "stale" };
    case "failed":
      return { status: "failed", message: state.value };
    default:
      return { status: state.status };
  }
}

export function Radio() {
  const { t } = useSettings();
  const [state, setState] = useState<player.PlayerState>(player.getState());
  const [directory, setDirectory] = useState<LoadState<RadioDirectory>>();
  const [query, setQuery] = useState("");
  /** The station whose stream is still being resolved, so its row can say so. */
  const [resolving, setResolving] = useState<string | null>(null);
  /** A station that turned out to have no playable source. */
  const [unplayable, setUnplayable] = useState<string | null>(null);

  useEffect(() => player.subscribe(setState), []);

  const load = useCallback((refresh = false) => {
    setDirectory(undefined);
    api
      .getStations(refresh)
      .then(setDirectory)
      .catch((error: unknown) => setDirectory({ status: "failed", value: String(error) }));
  }, []);

  useEffect(() => load(), [load]);

  /**
   * The directory carries a stream URL only for the stations it happened to
   * list one for; the rest are resolved from the station's own page on play.
   */
  const start = async (slug: string, name: string, streamUrl: string | null) => {
    if (streamUrl) {
      player.play({ slug, name }, streamUrl);
      return;
    }
    setResolving(slug);
    setUnplayable(null);
    try {
      player.play({ slug, name }, await api.stationStream(slug));
    } catch {
      // Said on the row itself rather than in the player: nothing is playing,
      // so a player-level error would point at an empty control.
      setUnplayable(slug);
    } finally {
      setResolving(null);
    }
  };

  const stations =
    directory?.status === "fresh" || directory?.status === "stale" ? directory.value.stations : [];
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? stations.filter(
        (station) =>
          station.name.toLowerCase().includes(needle) ||
          (station.frequency ?? "").toLowerCase().includes(needle),
      )
    : stations;

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
        <StateBanner state={banner(directory)} onRetry={() => load(true)}>
          <div className="relative mb-1.5">
            <Icon
              path={ICONS.search}
              className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("radio.search")}
              className="h-8 w-full rounded-md border border-border bg-surface pl-7 pr-2 text-[12px]"
            />
          </div>

          {matches.length === 0 && (
            <p className="py-2 text-text-secondary">{t("radio.no-stations")}</p>
          )}

          <ul>
            {matches.map((station) => {
              const playing = state.nowPlaying?.slug === station.slug;
              return (
                <li key={station.slug}>
                  <button
                    type="button"
                    onClick={() => start(station.slug, station.name, station.streamUrl)}
                    className={`flex w-full items-center justify-between gap-2 border-b border-border/60 py-1.5 text-left last:border-0 ${
                      playing ? "text-accent" : "hover:text-text"
                    }`}
                  >
                    {station.logoUrl && (
                      // Decorative: the name beside it already identifies the
                      // station, and a broken logo must not leave alt text
                      // stranded mid-row.
                      <img
                        src={station.logoUrl}
                        alt=""
                        loading="lazy"
                        className="size-7 shrink-0 rounded object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{station.name}</span>
                      {station.frequency && (
                        <span className="block text-[11px] text-text-muted">
                          {station.frequency}
                        </span>
                      )}
                      {unplayable === station.slug && (
                        <span className="block text-[11px] text-holiday">
                          {t("radio.unplayable")}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] text-text-muted">
                      {resolving === station.slug ? "…" : playing ? "▶" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </StateBanner>
      </Card>
    </div>
  );
}
