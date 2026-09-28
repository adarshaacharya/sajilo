import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useHeaderSlot } from "../../shared/components/header-slot";
import { Icon } from "../../shared/components/icon";
import { StateBanner } from "../../shared/components/state-banner";
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
import type { RashifalSnapshot } from "../../types/api/RashifalSnapshot";
import type { RashiSign } from "../../types/api/RashiSign";
import { SourceNote } from "../bazar/_components/source-note";
import { DailyOffer } from "./_components/daily-offer";
import { ReadingCard, ReadingCardSkeleton } from "./_components/reading-card";
import { SignFinder } from "./_components/sign-finder";
import { SignGrid } from "./_components/sign-grid";
import { publishedStamp } from "./_lib/format";
import { SIGNS, validSign } from "./_lib/signs";

const STORAGE_KEY = "selectedRashi";

export function Rashifal() {
  const { t, language } = useSettings();
  const {
    data: state,
    isValidating,
    mutate,
  } = useSWR("rashifal", () => catchAsFailed(api.getRashifal(false)));
  const load = useCallback(
    (refresh = false) =>
      mutate(catchAsFailed<RashifalSnapshot>(api.getRashifal(refresh)), { revalidate: false }),
    [mutate],
  );
  const [storedSign, setStoredSign] = usePersistedString(STORAGE_KEY);
  const mine = validSign(storedSign);
  const mineInfo = SIGNS.find((sign) => sign.id === mine);
  const [viewing, setViewing] = useState<RashiSign | null>(null);

  const loading = isValidating;
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
      <StateBanner state={banner} onRetry={() => load(true)} skeleton={<ReadingCardSkeleton />}>
        {shown && (
          <ReadingCard
            sign={shown}
            reading={reading}
            freshness={snapshot?.freshness}
            isMine={isMine}
            onSetMine={() => choose(shown)}
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

      {published && <SourceNote label={t("bazar.published")} stamp={published} />}
    </div>
  );
}
