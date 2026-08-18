import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { useHeaderSlot } from "../components/HeaderSlot";
import { Icon } from "../components/Icon";
import { FadeUp, Stagger } from "../components/motion";
import { StateBanner } from "../components/StateBanner";
import { api } from "../lib/ipc";
import { catchAsFailed, fetchedAtLabel, loadBanner, loadedValue } from "../lib/loadState";
import { useSettings } from "../lib/settings";
import type { NewsDigest } from "../types/api/NewsDigest";
import type { NewsItem } from "../types/api/NewsItem";

const PAGE = 20;

function age(item: NewsItem): string {
  if (!item.published) return "";
  const date = new Date(item.published);
  if (item.precision === "day") {
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    Math.round((date.getTime() - Date.now()) / 3_600_000),
    "hour",
  );
}

async function openLink(url: string) {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function HeadlineRow({ item, onOpen }: { item: NewsItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="surface-card group w-full p-2 text-left transition-colors hover:bg-surface-hover"
    >
      <p className="text-[13px] leading-snug">{item.title}</p>
      <div className="mt-1 flex items-center gap-1 text-[10px]">
        <span className="font-medium text-[color:var(--color-accent-mark)]">{item.sourceName}</span>
        {item.published && (
          <>
            <span className="text-text-muted">·</span>
            <span className="text-text-secondary">{age(item)}</span>
          </>
        )}
        <Icon
          name="openExternal"
          className="ml-auto size-2.5 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>
    </button>
  );
}

export function News() {
  const { t } = useSettings();
  const [visible, setVisible] = useState(PAGE);
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

  const digest = loadedValue(state);
  const items = digest?.items.slice(0, visible) ?? [];
  const banner = loadBanner(state, fetchedAtLabel(digest?.freshness));
  const freshness = digest ? fetchedAtLabel(digest.freshness) : null;

  return (
    <StateBanner state={banner} onRetry={() => load(true)}>
      {items.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <Icon name="news" className="size-8 text-text-muted" />
          <p className="text-text-secondary">{t("state.not-yet")}</p>
        </div>
      ) : (
        <Stagger className="space-y-1">
          {items.map((item) => (
            <FadeUp key={`${item.source}-${item.link}`}>
              <HeadlineRow item={item} onOpen={() => openLink(item.link)} />
            </FadeUp>
          ))}
        </Stagger>
      )}

      {digest && visible < digest.items.length && (
        <button
          type="button"
          onClick={() => setVisible((count) => count + PAGE)}
          className="mt-2 w-full py-1.5 text-center text-[11px] text-text-muted hover:text-text-secondary"
        >
          {digest.items.length - visible} more
        </button>
      )}

      {digest && digest.failedSources.length > 0 && (
        <p className="mt-2 text-[10px] text-text-muted">
          Could not reach {digest.failedSources.join(", ")}.
        </p>
      )}

      {freshness && items.length > 0 && (
        <p className="mt-1 text-[10px] text-text-muted">{freshness}</p>
      )}
    </StateBanner>
  );
}
