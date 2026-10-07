import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { AnnouncementBanner } from "../../shared/components/announcement-banner";
import { useHeaderSlot } from "../../shared/components/header-slot";
import { Icon } from "../../shared/components/icon";
import { StateBanner } from "../../shared/components/state-banner";
import { ToastBar } from "../../shared/components/toast";
import { useSettings } from "../../shared/context/settings-context";
import { api } from "../../shared/lib/ipc";
import {
  catchAsFailed,
  fetchedAtLabel,
  loadBanner,
  loadedValue,
} from "../../shared/lib/load-state";
import { usePersistedString } from "../../shared/lib/persisted";
import { track } from "../../shared/lib/usage";
import { useRefreshFeedback } from "../../shared/lib/use-refresh-feedback";
import type { RashifalPeriod } from "../../types/api/RashifalPeriod";
import type { RashifalSnapshot } from "../../types/api/RashifalSnapshot";
import type { RashifalSource } from "../../types/api/RashifalSource";
import type { RashiSign } from "../../types/api/RashiSign";
import { SourceLink, SourceNote } from "../bazar/_components/source-note";
import { DailyOffer } from "./_components/daily-offer";
import { ReadingCard, ReadingCardSkeleton } from "./_components/reading-card";
import { SignFinder } from "./_components/sign-finder";
import { SignGrid } from "./_components/sign-grid";
import { publishedStamp } from "./_lib/format";
import { SIGNS, validSign } from "./_lib/signs";

const STORAGE_KEY = "selectedRashi";

/** Who to credit, by source. Proper names, so not translated. */
const SOURCES: Record<RashifalSource, { name: string; href: string }> = {
  hamroPatro: { name: "Hamro Patro", href: "https://www.hamropatro.com/rashifal" },
  ratopati: { name: "Ratopati", href: "https://www.ratopati.com/rashifal" },
};

export function Rashifal() {
  const { t, language } = useSettings();
  const [period, setPeriod] = useState<RashifalPeriod>("daily");
  const daily = period === "daily";
  // Daily keeps its own key: the background refresh and the morning
  // reminder warm it. The longer spans load when their tab is opened.
  const dailyFeed = useSWR("rashifal", () => catchAsFailed(api.getRashifal(false)));
  const spanFeed = useSWR(daily ? null : ["rashifal-period", period], () =>
    catchAsFailed(api.getRashifalPeriod(period)),
  );
  const { data: state, isValidating, mutate } = daily ? dailyFeed : spanFeed;
  const load = useCallback(
    (refresh = false) =>
      mutate(
        catchAsFailed<RashifalSnapshot>(
          daily ? api.getRashifal(refresh) : api.getRashifalPeriod(period, refresh),
        ),
        { revalidate: false },
      ),
    [mutate, daily, period],
  );
  const [storedSign, setStoredSign] = usePersistedString(STORAGE_KEY);
  const mine = validSign(storedSign);
  const mineInfo = SIGNS.find((sign) => sign.id === mine);
  const [viewing, setViewing] = useState<RashiSign | null>(null);

  const {
    run: runRefresh,
    refreshing,
    toast: refreshToast,
    dismiss: dismissRefresh,
  } = useRefreshFeedback(t("refresh.unchanged-rashifal"));
  const refreshNow = useCallback(
    () => void runRefresh([state], async () => [await load(true)]),
    [runRefresh, state, load],
  );
  const loading = isValidating || refreshing;
  const snapshot = loadedValue(state);
  const banner = loadBanner(state, fetchedAtLabel(snapshot?.freshness));
  const shown = viewing ?? mine;
  const reading = shown ? snapshot?.readings.find((entry) => entry.sign === shown) : undefined;
  const isMine = shown !== null && shown === mine;
  const published = publishedStamp(snapshot?.freshness);

  const refreshButton = useMemo(
    () => (
      <button
        type="button"
        onClick={refreshNow}
        disabled={loading}
        aria-label={t("action.refresh")}
        className="icon-btn shrink-0"
      >
        <Icon name="refresh" className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
      </button>
    ),
    [refreshNow, loading, t],
  );

  useHeaderSlot(refreshButton);

  // Reading your own sign here is this morning's rashifal read: the daily
  // reminder has nothing left to say today.
  const readMine = isMine && reading !== undefined;
  useEffect(() => {
    if (readMine) api.rashifalRead().catch(() => {});
  }, [readMine]);

  const choose = (id: RashiSign) => {
    track("action.rashi-pick");
    setStoredSign(id);
    setViewing(null);
  };

  if (!mine) {
    return (
      <div className="space-y-2.5">
        <SignFinder onChoose={choose} />
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <AnnouncementBanner screen="rashifal" />
      <StateBanner state={banner} onRetry={() => load(true)} skeleton={<ReadingCardSkeleton />}>
        {shown && (
          <ReadingCard
            sign={shown}
            reading={reading}
            freshness={snapshot?.freshness}
            isMine={isMine}
            onSetMine={() => choose(shown)}
            period={period}
            onPeriod={(next) => {
              track(`tab.rashifal.${next}`);
              setPeriod(next);
            }}
            title={daily ? null : snapshot?.title}
          />
        )}
      </StateBanner>

      <DailyOffer signName={(language === "ne" ? mineInfo?.ne : mineInfo?.en) ?? ""} />

      {/* Every sign, one tap away for looking up family; the star pins one as yours. */}
      <section className="space-y-1.5">
        <h2 className="px-0.5 text-[11px] font-semibold text-text-secondary">
          {t("rashifal.all-signs")}
        </h2>
        <SignGrid
          pressed={shown}
          mine={mine}
          onSelect={(id) => setViewing(id === mine || id === viewing ? null : id)}
          onPin={choose}
        />
      </section>

      {published && (
        <SourceNote label={t("bazar.published")} stamp={published}>
          {snapshot && (
            <SourceLink href={SOURCES[snapshot.source].href}>
              {t("rashifal.source").replace("{source}", SOURCES[snapshot.source].name)}
            </SourceLink>
          )}
        </SourceNote>
      )}
      <ToastBar toast={refreshToast} onDone={dismissRefresh} />
    </div>
  );
}
