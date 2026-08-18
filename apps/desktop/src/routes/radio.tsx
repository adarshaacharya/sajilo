import { useEffect, useMemo, useState } from "react";
import { BazarSearch } from "../components/bazar/BazarSearch";
import { Equalizer } from "../components/Equalizer";
import { useHeaderSlot } from "../components/HeaderSlot";
import { Icon } from "../components/Icon";
import { type LoadStatus, StateBanner } from "../components/StateBanner";
import * as player from "../lib/audio";
import { api } from "../lib/ipc";
import { usePersistedList } from "../lib/persisted";
import { useSettings } from "../lib/settings";
import { useCachedQuery } from "../lib/useCachedQuery";
import type { LoadState } from "../types/api/LoadState";
import type { RadioDirectory } from "../types/api/RadioDirectory";
import type { RadioStation } from "../types/api/RadioStation";

const PIN_KEY = "radioFavourites";

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

function StationArt({
  station,
  isPlaying,
}: {
  station: Pick<RadioStation, "logoUrl" | "name">;
  isPlaying: boolean;
}) {
  if (station.logoUrl) {
    return (
      <img
        src={station.logoUrl}
        alt=""
        className="size-[30px] shrink-0 rounded-[6px] bg-surface-raised object-cover"
      />
    );
  }

  return (
    <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[6px] bg-[color-mix(in_srgb,var(--color-accent-mark)_12%,transparent)] text-[color:var(--color-accent-mark)]">
      {isPlaying ? <Equalizer isPlaying /> : <Icon name="radio" className="size-3.5" />}
    </span>
  );
}

function StationRow({
  station,
  pinned,
  isCurrent,
  isPlaying,
  resolving,
  unplayable,
  onTogglePin,
  onPlay,
  t,
}: {
  station: RadioStation;
  pinned: boolean;
  isCurrent: boolean;
  isPlaying: boolean;
  resolving: boolean;
  unplayable: boolean;
  onTogglePin: () => void;
  onPlay: () => void;
  t: ReturnType<typeof useSettings>["t"];
}) {
  return (
    <div
      className={`row-line group flex items-center gap-1.5 px-1.5 py-2 transition-colors hover:bg-surface-hover ${
        isCurrent ? "bg-[color-mix(in_srgb,var(--color-accent-mark)_8%,transparent)]" : ""
      }`}
    >
      <button
        type="button"
        onClick={onTogglePin}
        aria-label={t("radio.pin")}
        className={`shrink-0 p-0.5 transition-opacity ${
          pinned
            ? "text-[color:var(--color-accent-mark)]"
            : "text-text-muted opacity-0 group-hover:opacity-100"
        }`}
      >
        <Icon name={pinned ? "pinFill" : "pin"} className="size-3" />
      </button>
      <button
        type="button"
        onClick={onPlay}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <StationArt station={station} isPlaying={isPlaying} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[12px] ${isCurrent ? "font-semibold" : ""}`}>
            {station.name}
          </span>
          {station.frequency && (
            <span className="block text-[10px] text-text-muted">{station.frequency}</span>
          )}
          {unplayable && (
            <span className="block text-[10px] text-holiday">{t("radio.unplayable")}</span>
          )}
        </span>
        {isCurrent ? (
          <Equalizer isPlaying={isPlaying} />
        ) : resolving ? (
          <Icon name="refresh" className="size-3 shrink-0 animate-spin text-text-muted" />
        ) : null}
      </button>
    </div>
  );
}

function StationList({
  title,
  stations,
  pins,
  state,
  resolving,
  unplayable,
  onTogglePin,
  onPlay,
  t,
}: {
  title?: string;
  stations: RadioStation[];
  pins: string[];
  state: ReturnType<typeof player.getState>;
  resolving: string | null;
  unplayable: string | null;
  onTogglePin: (slug: string) => void;
  onPlay: (station: RadioStation) => void;
  t: ReturnType<typeof useSettings>["t"];
}) {
  if (stations.length === 0) return null;
  return (
    <section className="surface-card mt-2 p-1">
      {title && (
        <p className="px-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          {title}
        </p>
      )}
      <ul>
        {stations.map((station) => {
          const isCurrent = state.nowPlaying?.slug === station.slug;
          const isPlaying = isCurrent && state.isPlaying;
          return (
            <li key={station.slug}>
              <StationRow
                station={station}
                pinned={pins.includes(station.slug)}
                isCurrent={isCurrent}
                isPlaying={isPlaying}
                resolving={resolving === station.slug}
                unplayable={unplayable === station.slug}
                onTogglePin={() => onTogglePin(station.slug)}
                onPlay={() => onPlay(station)}
                t={t}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Radio() {
  const { t } = useSettings();
  const [state, setState] = useState(player.getState());
  const {
    value: directory,
    isValidating,
    reload: load,
  } = useCachedQuery("radio-stations", (refresh) =>
    api
      .getStations(refresh)
      .catch(
        (error: unknown): LoadState<RadioDirectory> => ({ status: "failed", value: String(error) }),
      ),
  );
  const [query, setQuery] = useState("");
  const [pins, setPins] = usePersistedList(PIN_KEY);
  const [resolving, setResolving] = useState<string | null>(null);
  const [unplayable, setUnplayable] = useState<string | null>(null);

  useEffect(() => player.subscribe(setState), []);

  const loading = isValidating;

  const refreshButton = useMemo(
    () => (
      <button
        type="button"
        onClick={() => load(true)}
        disabled={loading}
        aria-label={t("action.refresh")}
        className="icon-btn shrink-0"
      >
        <Icon name="refresh" className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
      </button>
    ),
    [load, loading, t],
  );

  useHeaderSlot(refreshButton);

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

  const pinned = matches
    .filter((station) => pins.includes(station.slug))
    .sort((a, b) => pins.indexOf(a.slug) - pins.indexOf(b.slug));
  const others = matches.filter((station) => !pins.includes(station.slug));

  const togglePin = (slug: string) => {
    setPins((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug],
    );
  };

  const current = state.nowPlaying
    ? (stations.find((s) => s.slug === state.nowPlaying?.slug) ?? {
        slug: state.nowPlaying.slug,
        name: state.nowPlaying.name,
        frequency: state.nowPlaying.frequency ?? null,
        logoUrl: null,
        streamUrl: null,
      })
    : null;

  return (
    <div className="space-y-2.5">
      {current && (
        <section className="surface-card radio-now-playing p-2.5">
          <div className="relative z-[1] flex items-center gap-2.5">
            <StationArt station={current} isPlaying={state.isPlaying} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                {t("radio.now-playing")}
              </p>
              <p className="truncate text-[14px] font-semibold leading-tight">{current.name}</p>
              {current.frequency && (
                <p className="text-[11px] text-text-muted">{current.frequency}</p>
              )}
            </div>
            <button
              type="button"
              aria-label={state.isPlaying ? "Pause" : "Play"}
              disabled={state.isLoading || resolving === current.slug}
              onClick={() => player.togglePlayback()}
              className="icon-btn shrink-0"
            >
              {state.isLoading || resolving === current.slug ? (
                <Icon name="refresh" className="size-3.5 animate-spin" />
              ) : state.isPlaying ? (
                <Icon name="pause" className="size-3.5" />
              ) : (
                <Icon name="play" className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              aria-label={t("radio.stop")}
              onClick={() => player.stop()}
              className="icon-btn shrink-0"
            >
              <Icon name="stop" className="size-3.5" />
            </button>
          </div>
        </section>
      )}

      {state.error && <p className="px-0.5 text-[11px] text-holiday">{state.error}</p>}

      <StateBanner state={banner(directory)} onRetry={() => load(true)}>
        <BazarSearch value={query} onChange={setQuery} placeholder={t("radio.search")} />

        {matches.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-text-secondary">
            {t("radio.no-stations")}
          </p>
        ) : (
          <>
            <StationList
              title={pinned.length > 0 ? t("radio.pinned") : undefined}
              stations={pinned}
              pins={pins}
              state={state}
              resolving={resolving}
              unplayable={unplayable}
              onTogglePin={togglePin}
              onPlay={toggleStation}
              t={t}
            />
            <StationList
              title={
                pinned.length > 0 && others.length > 0
                  ? t("radio.all-stations")
                  : t("radio.stations")
              }
              stations={others}
              pins={pins}
              state={state}
              resolving={resolving}
              unplayable={unplayable}
              onTogglePin={togglePin}
              onPlay={toggleStation}
              t={t}
            />
          </>
        )}
      </StateBanner>
    </div>
  );
}
