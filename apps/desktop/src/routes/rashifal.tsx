import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { SourceLink, SourceNote } from "../components/bazar/SourceNote";
import { useHeaderSlot } from "../components/HeaderSlot";
import { Icon } from "../components/Icon";
import { ReadingCard } from "../components/rashifal/ReadingCard";
import { SignFinder } from "../components/rashifal/SignFinder";
import { SignStrip } from "../components/rashifal/SignStrip";
import { validSign } from "../components/rashifal/signs";
import { StateBanner } from "../components/StateBanner";
import { api } from "../lib/ipc";
import { catchAsFailed, fetchedAtLabel, loadBanner, loadedValue } from "../lib/loadState";
import { publishedStamp } from "../lib/rashifal";
import { usePersistedString } from "../lib/persisted";
import { useSettings } from "../lib/settings";
import type { RashifalSnapshot } from "../types/api/RashifalSnapshot";
import type { RashiSign } from "../types/api/RashiSign";

const STORAGE_KEY = "selectedRashi";

export function Rashifal() {
  const { t } = useSettings();
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
  const [viewing, setViewing] = useState<RashiSign | null>(null);
  const [picking, setPicking] = useState(false);

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

  const choose = (id: RashiSign) => {
    setStoredSign(id);
    setViewing(null);
    setPicking(false);
  };

  if (!mine || picking) {
    return (
      <div className="space-y-2.5">
        <SignFinder highlight={mine} onChoose={choose} />
        {published && (
          <SourceNote label={t("bazar.published")} stamp={published}>
            <SourceLink href="https://www.hamropatro.com/rashifal">{t("rashifal.source")}</SourceLink>
          </SourceNote>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <StateBanner state={banner} onRetry={() => load(true)}>
        {shown && (
          <ReadingCard
            sign={shown}
            reading={reading}
            freshness={snapshot?.freshness}
            isMine={isMine}
            onChangeSign={() => setPicking(true)}
            onBackToMine={() => setViewing(null)}
          />
        )}
      </StateBanner>

      <SignStrip
        shown={shown}
        mine={mine}
        onSelect={(id) => setViewing(id === mine ? null : id)}
      />

      {published && (
        <SourceNote label={t("bazar.published")} stamp={published}>
          <SourceLink href="https://www.hamropatro.com/rashifal">{t("rashifal.source")}</SourceLink>
        </SourceNote>
      )}
    </div>
  );
}
