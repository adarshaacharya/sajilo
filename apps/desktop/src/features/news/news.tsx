import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useHeaderSlot } from "../../shared/components/header-slot";
import { Icon } from "../../shared/components/icon";
import { FadeUp, Stagger } from "../../shared/components/motion";
import { Select } from "../../shared/components/select";
import { StateBanner } from "../../shared/components/state-banner";
import { useSettings } from "../../shared/context/settings-context";
import { openExternalLink } from "../../shared/lib/external-link";
import { api } from "../../shared/lib/ipc";
import {
  catchAsFailed,
  fetchedAtLabel,
  loadBanner,
  loadedValue,
} from "../../shared/lib/load-state";
import { usePersistedString } from "../../shared/lib/persisted";
import type { NewsDigest } from "../../types/api/NewsDigest";
import type { NewsSourceInfo } from "../../types/api/NewsSourceInfo";
import { HeadlineRow } from "./_components/headline-row";

const PAGE = 20;

/** The picker's "no filter" value. Not a `NewsSource`, so it cannot collide. */
const ALL = "all";

const SOURCE_KEY = "news.source";

export function News() {
  const { t } = useSettings();
  const [visible, setVisible] = useState(PAGE);
  const [sources, setSources] = useState<NewsSourceInfo[]>([]);
  const [saved, setSaved] = usePersistedString(SOURCE_KEY);
  const {
    data: state,
    isValidating,
    mutate,
  } = useSWR("news", () => catchAsFailed(api.getNews(false)), {
    onSuccess: () => setVisible(PAGE),
  });
  const load = useCallback(
    (refresh = false) =>
      mutate(catchAsFailed<NewsDigest>(api.getNews(refresh)), { revalidate: false }).then(() =>
        setVisible(PAGE),
      ),
    [mutate],
  );

  useEffect(() => {
    api
      .newsSources()
      .then(setSources)
      .catch(() => setSources([]));
  }, []);

  const loading = isValidating;

  // A source saved before it was renamed or dropped must not leave the list
  // permanently empty, so an unknown key reads as no filter at all. Until the
  // catalogue arrives nothing is known yet, and the saved key is trusted —
  // dropping it for that moment would flash the unfiltered list.
  const known = sources.length === 0 || sources.some((source) => source.id === saved);
  const selected = saved && known ? saved : ALL;

  const pick = useCallback(
    (next: string) => {
      setSaved(next === ALL ? null : next);
      setVisible(PAGE);
    },
    [setSaved],
  );

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

  const digest = loadedValue(state);
  const filtered =
    selected === ALL
      ? (digest?.items ?? [])
      : (digest?.items ?? []).filter((item) => item.source === selected);
  const items = filtered.slice(0, visible);
  const banner = loadBanner(state, fetchedAtLabel(digest?.freshness));
  const freshness = digest ? fetchedAtLabel(digest.freshness) : null;

  // Filtered to one source, the row's own label repeats the picker.
  const showSource = selected === ALL;

  // Filtered, the only failure worth reporting is the chosen source's own —
  // otherwise an empty list is explained by papers the reader is not reading.
  const selectedName = sources.find((source) => source.id === selected)?.name;
  const failed = (digest?.failedSources ?? []).filter(
    (name) => selected === ALL || name === selectedName,
  );

  const emptyMessage = selected === ALL ? t("state.not-yet") : t("news.none-from-source");

  return (
    <StateBanner state={banner} onRetry={() => load(true)}>
      <div className="mb-2">
        <Select
          ariaLabel={t("news.source")}
          value={selected}
          onChange={pick}
          options={[{ id: ALL, label: t("news.all-sources") }]}
          groups={[
            {
              label: t("news.group-nepali"),
              options: sources
                .filter((source) => !source.english)
                .map((source) => ({ id: source.id as string, label: source.name })),
            },
            {
              label: t("news.group-english"),
              options: sources
                .filter((source) => source.english)
                .map((source) => ({ id: source.id as string, label: source.name })),
            },
          ]}
        />
      </div>

      {items.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <Icon name="news" className="size-8 text-text-muted" />
          <p className="text-text-secondary">{emptyMessage}</p>
        </div>
      ) : (
        <Stagger className="space-y-1">
          {items.map((item) => (
            <FadeUp key={`${item.source}-${item.link}`}>
              <HeadlineRow
                item={item}
                showSource={showSource}
                onOpen={() => openExternalLink(item.link)}
              />
            </FadeUp>
          ))}
        </Stagger>
      )}

      {visible < filtered.length && (
        <button
          type="button"
          onClick={() => setVisible((count) => count + PAGE)}
          className="mt-2 w-full py-1.5 text-center text-[11px] text-text-muted hover:text-text-secondary"
        >
          {filtered.length - visible} more
        </button>
      )}

      {failed.length > 0 && (
        <p className="mt-2 text-[10px] text-text-muted">Could not reach {failed.join(", ")}.</p>
      )}

      {freshness && items.length > 0 && (
        <p className="mt-1 text-[10px] text-text-muted">{freshness}</p>
      )}
    </StateBanner>
  );
}
