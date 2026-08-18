import { useCallback, useEffect, useState } from "react";
import { Card } from "../components/Card";
import { StateBanner } from "../components/StateBanner";
import { api } from "../lib/ipc";
import { fetchedAtLabel, loadBanner, loadedValue } from "../lib/loadState";
import { useSettings } from "../lib/settings";
import type { LoadState } from "../types/api/LoadState";
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

export function News() {
  const { t } = useSettings();
  const [state, setState] = useState<LoadState<NewsDigest>>();
  const [visible, setVisible] = useState(PAGE);

  const load = useCallback((refresh = false) => {
    setState(undefined);
    api
      .getNews(refresh)
      .then((next) => {
        setState(next);
        setVisible(PAGE);
      })
      .catch((error: unknown) => setState({ status: "failed", value: String(error) }));
  }, []);

  useEffect(() => load(), [load]);

  const digest = loadedValue(state);
  const items = digest?.items.slice(0, visible) ?? [];
  const banner = loadBanner(state, fetchedAtLabel(digest?.freshness));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => load(true)}
          className="rounded px-2 py-0.5 text-[11px] text-text-secondary hover:bg-surface-hover"
        >
          {t("action.refresh")}
        </button>
      </div>

      <Card>
        <StateBanner state={banner} onRetry={() => load(true)}>
          {items.length === 0 ? (
            <p className="text-text-muted">{t("state.not-yet")}</p>
          ) : (
            <ul className="list-rows">
              {items.map((item) => (
                <li key={`${item.source}-${item.link}`}>
                  <button
                    type="button"
                    onClick={() => openLink(item.link)}
                    className="w-full py-2 text-left"
                  >
                    <p className="leading-snug">{item.title}</p>
                    <p className="mt-0.5 text-[11px] text-text-muted">
                      {item.sourceName}
                      {item.published ? ` · ${age(item)}` : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {digest && visible < digest.items.length && (
            <button
              type="button"
              onClick={() => setVisible((count) => count + PAGE)}
              className="mt-2 w-full rounded-xl border border-border py-1 text-[11px] text-text-secondary hover:bg-surface-hover"
            >
              {digest.items.length - visible} more
            </button>
          )}
          {digest && digest.failedSources.length > 0 && (
            <p className="mt-2 text-[11px] text-text-muted">
              Could not reach {digest.failedSources.join(", ")}.
            </p>
          )}
        </StateBanner>
      </Card>
    </div>
  );
}
