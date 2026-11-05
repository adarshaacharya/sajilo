import { useEffect, useState } from "react";
import { Select } from "../../../shared/components/select";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { EVERY_HOURS, everyLabel, followSummary } from "../../../shared/lib/news-follow";
import type { NewsFollows } from "../../../types/api/NewsFollows";
import type { NewsSourceInfo } from "../../../types/api/NewsSourceInfo";
import { DailyTimes } from "../../news/_components/follow-bell";
import { SettingsSection } from "./settings-section";

const ALL = "all";

/** The newsrooms followed from News, in one place to review or stop. Absent
 * until one is followed: the bell on News is where following starts. */
export function NewsFollowsSection() {
  const { t } = useSettings();
  const [follows, setFollows] = useState<NewsFollows | null>(null);
  const [sources, setSources] = useState<NewsSourceInfo[]>([]);

  useEffect(() => {
    api
      .newsFollows()
      .then(setFollows)
      .catch(() => {});
    api
      .newsSources()
      .then(setSources)
      .catch(() => {});
  }, []);

  const followed = Object.entries(follows?.sources ?? {});
  if (!follows || followed.length === 0) return null;

  const nameOf = (id: string) =>
    id === ALL ? t("news.all-sources") : (sources.find((source) => source.id === id)?.name ?? id);
  const anyDaily = followed.some(([, mode]) => mode === "daily");
  const anyHours = followed.some(([, mode]) => mode === "hours");

  return (
    <SettingsSection title={t("notifications.group.news")}>
      {followed.map(([id, mode]) => (
        <div key={id} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[12px]">{nameOf(id)}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-text-muted">
              {mode ? followSummary(t, mode, follows) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              api
                .setNewsFollow(id, null)
                .then(setFollows)
                .catch(() => {})
            }
            className="settings-btn shrink-0"
          >
            {t("news.unfollow")}
          </button>
        </div>
      ))}
      {anyDaily && (
        <div className="rounded-lg bg-surface-hover px-2.5 py-1.5">
          <span className="text-[11.5px] text-text-secondary">{t("news.follow.daily-line")}</span>
          <DailyTimes
            follows={follows}
            save={(next, call) => {
              setFollows(next);
              call.then((saved) => saved && setFollows(saved)).catch(() => {});
            }}
          />
        </div>
      )}
      {anyHours && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-hover px-2.5 py-1.5">
          <span className="text-[11.5px] text-text-secondary">{t("news.every-label")}</span>
          <div className="w-[96px] shrink-0">
            <Select
              ariaLabel={t("news.every-label")}
              value={String(follows.everyHours)}
              onChange={(next) =>
                api
                  .setNewsEveryHours(Number(next))
                  .then(setFollows)
                  .catch(() => {})
              }
              options={EVERY_HOURS.map((hours) => ({
                id: String(hours),
                label: everyLabel(t, hours),
              }))}
            />
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
