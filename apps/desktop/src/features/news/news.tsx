import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { useHeaderSlot } from "../../shared/components/header-slot";
import { Icon } from "../../shared/components/icon";
import { FadeUp, Stagger } from "../../shared/components/motion";
import { StateBanner } from "../../shared/components/state-banner";
import { useSettings } from "../../shared/context/settings-context";
import { api } from "../../shared/lib/ipc";
import {
  catchAsFailed,
  fetchedAtLabel,
  loadBanner,
  loadedValue,
} from "../../shared/lib/load-state";
import type { NewsDigest } from "../../types/api/NewsDigest";
import { HeadlineRow } from "./_components/headline-row";

const PAGE = 20;

async function openLink(url: string) {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
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
