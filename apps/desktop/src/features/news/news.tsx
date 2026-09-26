import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import useSWR from "swr";
import { useHeaderSlot } from "../../shared/components/header-slot";
import { Icon } from "../../shared/components/icon";
import { FadeUp, Stagger } from "../../shared/components/motion";
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
import { usePersistedList, usePersistedString } from "../../shared/lib/persisted";
import { track } from "../../shared/lib/usage";
import type { NewsDigest } from "../../types/api/NewsDigest";
import type { NewsSourceInfo } from "../../types/api/NewsSourceInfo";
import { HeadlineRow, sourceColor } from "./_components/headline-row";

const PAGE = 20;

/** The picker's "no filter" value. Not a `NewsSource`, so it cannot collide. */
const ALL = "all";

const SOURCE_KEY = "news.source";
/** Links of headlines already opened, newest first. */
const READ_KEY = "news.read";
/** Enough to cover several days of every feed; older links fall off. */
const READ_LIMIT = 600;
const GOVERNMENT = "nepalGovernment";

export function News() {
  const { t } = useSettings();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(PAGE);
  const [sources, setSources] = useState<NewsSourceInfo[]>([]);
  const [saved, setSaved] = usePersistedString(SOURCE_KEY);
  const [readLinks, setReadLinks] = usePersistedList(READ_KEY);
  const read = useMemo(() => new Set(readLinks), [readLinks]);
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
  // Government notices have their own row at the top of "All", so the
  // newsroom feed below is newsrooms only.
  const notices = (digest?.items ?? []).filter((item) => item.source === GOVERNMENT);
  const newNotices = notices.filter((item) => !read.has(item.link)).length;
  const filtered =
    selected === ALL
      ? (digest?.items ?? []).filter((item) => item.source !== GOVERNMENT)
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

  // Infinite scroll: a sentinel just past the last row loads the next page
  // once it comes near view. It only exists in the DOM while there is more
  // to load, so the observer disconnects itself the moment the list is
  // fully shown — nothing left dangling once every headline is on screen.
  const hasMore = visible < filtered.length;
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setLoadingMore(true);
          setVisible((count) => count + PAGE);
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore]);

  // The next 20 rows are already in memory — this isn't a fetch, it's the
  // stagger-in animation for 20 rows at once. Holding the loading state
  // through that keeps the transition from reading as a dead pause between
  // the indicator vanishing and the rows actually finishing their entrance.
  useEffect(() => {
    if (!loadingMore) return;
    const id = setTimeout(() => setLoadingMore(false), 450);
    return () => clearTimeout(id);
  }, [loadingMore]);

  return (
    <StateBanner state={banner} onRetry={() => load(true)}>
      {/* Every source at once, one tap each, instead of a dropdown. */}
      <fieldset
        aria-label={t("news.source")}
        className="-mx-0.5 mb-2 flex min-w-0 border-0 gap-1.5 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {[{ id: ALL, name: t("news.all-sources") }, ...sources].map((source) => (
          <button
            key={source.id}
            type="button"
            aria-pressed={selected === source.id}
            onClick={() => pick(source.id)}
            className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors ${
              selected === source.id
                ? "border-[color:var(--color-accent-mark)] bg-[color:color-mix(in_srgb,var(--color-accent-mark)_12%,transparent)] font-semibold text-accent-mark"
                : "border-[color:var(--color-border)] text-text-secondary hover:text-text"
            }`}
          >
            {source.id !== ALL && (
              <span
                className="size-1.5 rounded-full"
                style={{ background: sourceColor(source.id) }}
                aria-hidden="true"
              />
            )}
            {source.name}
          </button>
        ))}
      </fieldset>

      {selected === ALL && notices.length > 0 && (
        <button
          type="button"
          onClick={() => pick(GOVERNMENT)}
          className="surface-card mb-2 flex w-full cursor-pointer items-center gap-2.5 p-2.5 text-left transition-colors hover:bg-surface-hover"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[color:color-mix(in_srgb,var(--color-holiday)_14%,transparent)] text-[color:var(--color-holiday)]">
            <Icon name="news" className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold">
              {t("news.notices-title")}
              {newNotices > 0 && (
                <span className="ml-1.5 rounded-full bg-[color:var(--color-holiday)] px-1.5 py-px text-[10px] text-white">
                  {t("news.notices-new").replace("{n}", String(newNotices))}
                </span>
              )}
            </span>
            <span className="block truncate text-[11px] text-text-muted">{notices[0]?.title}</span>
          </span>
          <span className="text-[12px] text-text-muted" aria-hidden="true">
            ›
          </span>
        </button>
      )}

      {items.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <Icon name="news" className="size-8 text-text-muted" />
          <p className="text-text-secondary">{emptyMessage}</p>
        </div>
      ) : (
        // One card, thin dividers: more headlines fit, and it reads as a list.
        <Stagger className="surface-card overflow-hidden">
          {items.map((item) => (
            <FadeUp
              key={`${item.source}-${item.link}`}
              className="border-b border-divider last:border-b-0"
            >
              <HeadlineRow
                item={item}
                showSource={showSource}
                read={read.has(item.link)}
                onOpen={() => {
                  track("action.news-open");
                  if (!read.has(item.link)) {
                    setReadLinks((current) => [item.link, ...current].slice(0, READ_LIMIT));
                  }
                  return item.source === "nepalGovernment" && item.id
                    ? navigate(`/news/government?id=${encodeURIComponent(item.id)}`)
                    : openExternalLink(item.link);
                }}
              />
            </FadeUp>
          ))}
        </Stagger>
      )}

      {hasMore && (
        <div
          ref={sentinelRef}
          className="flex items-center justify-center gap-1.5 py-3 text-[10px] text-text-muted"
          aria-hidden
        >
          {loadingMore ? (
            <>
              <Icon name="refresh" className="size-3 animate-spin" />
              {t("state.loading")}
            </>
          ) : (
            <span className="size-1.5 animate-pulse rounded-full bg-text-muted" />
          )}
        </div>
      )}

      {failed.length > 0 && (
        <p className="mt-2 text-[11px] text-text-secondary">
          {t("news.could-not-reach").replace("{sources}", failed.join(", "))}
        </p>
      )}

      {freshness && items.length > 0 && (
        <p className="mt-1 text-[10px] text-text-muted">{freshness}</p>
      )}
    </StateBanner>
  );
}
