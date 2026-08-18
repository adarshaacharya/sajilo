import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Equalizer } from "../components/Equalizer";
import { Icon } from "../components/Icon";
import { type LoadStatus, StateBanner } from "../components/StateBanner";
import * as player from "../lib/audio";
import { api } from "../lib/ipc";
import { useSettings } from "../lib/settings";
import type { LoadState } from "../types/api/LoadState";
import type { RadioDirectory } from "../types/api/RadioDirectory";
import type { RadioStation } from "../types/api/RadioStation";

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

function ControlButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md p-1.5 text-text-secondary hover:bg-surface-hover hover:text-text disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function Radio() {
  const { t } = useSettings();
  const [state, setState] = useState(player.getState());
  const [directory, setDirectory] = useState<LoadState<RadioDirectory>>();
  const [query, setQuery] = useState("");
  const [resolving, setResolving] = useState<string | null>(null);
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

  const toggleStation = async (station: RadioStation) => {
    const current = state.nowPlaying?.slug === station.slug;
    if (current) {
      player.togglePlayback();
      return;
    }

    if (station.streamUrl) {
      player.play(
        { slug: station.slug, name: station.name, frequency: station.frequency },
        station.streamUrl,
      );
      return;
    }

    setResolving(station.slug);
    setUnplayable(null);
    try {
      const url = await api.stationStream(station.slug);
      player.play({ slug: station.slug, name: station.name, frequency: station.frequency }, url);
    } catch {
      setUnplayable(station.slug);
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
          (station.frequency ?? "").toLowerCase().includes(needle) ||
          station.slug.replace(/-/g, " ").includes(needle),
      )
    : stations;

  const current = state.nowPlaying
    ? stations.find((s) => s.slug === state.nowPlaying?.slug) ?? {
        slug: state.nowPlaying.slug,
        name: state.nowPlaying.name,
        frequency: state.nowPlaying.frequency ?? null,
        logoUrl: null,
        streamUrl: null,
      }
    : null;

  return (
    <div className="space-y-2.5">
      {current && (
        <section className="flex items-center gap-2 rounded-[14px] bg-accent/10 px-2.5 py-2">
          <Icon
            name="radio"
            className="size-4 shrink-0 text-[color:var(--color-accent-mark)]"
          />
          <Equalizer isPlaying={state.isPlaying} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-tight">{current.name}</p>
            {current.frequency && (
              <p className="text-[11px] text-text-muted">{current.frequency}</p>
            )}
          </div>
          <ControlButton
            label={state.isPlaying ? "Pause" : "Play"}
            disabled={state.isLoading || resolving === current.slug}
            onClick={() => player.togglePlayback()}
          >
            {state.isLoading || resolving === current.slug ? (
              <Icon name="refresh" className="size-3.5 animate-spin" />
            ) : state.isPlaying ? (
              <Icon name="pause" className="size-3.5" />
            ) : (
              <Icon name="play" className="size-3.5" />
            )}
          </ControlButton>
          <ControlButton label={t("radio.stop")} onClick={() => player.stop()}>
            <Icon name="stop" className="size-3.5" />
          </ControlButton>
        </section>
      )}

      {state.error && <p className="text-[11px] text-text-muted">{state.error}</p>}

      <StateBanner state={banner(directory)} onRetry={() => load(true)}>
        <div className="relative mb-2">
          <Icon
            name="search"
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
          <p className="py-6 text-center text-text-secondary">{t("radio.no-stations")}</p>
        )}

        <ul className="space-y-1">
          {matches.map((station) => {
            const isCurrent = state.nowPlaying?.slug === station.slug;
            const isPlaying = isCurrent && state.isPlaying;
            return (
              <li key={station.slug}>
                <button
                  type="button"
                  onClick={() => toggleStation(station)}
                  className={`flex w-full items-center gap-2 rounded-[14px] px-2 py-2 text-left transition-colors ${
                    isCurrent
                      ? "bg-accent/10"
                      : "bg-surface-raised hover:bg-surface-hover"
                  }`}
                >
                  {isCurrent ? (
                    <Equalizer isPlaying={isPlaying} />
                  ) : (
                    <span className="flex size-[18px] shrink-0 items-center justify-center text-text-muted">
                      <Icon name="play" className="size-3.5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-[13px] ${isCurrent ? "font-semibold" : ""}`}
                    >
                      {station.name}
                    </span>
                    {station.frequency && (
                      <span className="block text-[11px] text-text-muted">{station.frequency}</span>
                    )}
                    {unplayable === station.slug && (
                      <span className="block text-[11px] text-holiday">{t("radio.unplayable")}</span>
                    )}
                  </span>
                  {resolving === station.slug && (
                    <Icon
                      name="refresh"
                      className="size-3.5 shrink-0 animate-spin text-text-muted"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </StateBanner>
    </div>
  );
}
