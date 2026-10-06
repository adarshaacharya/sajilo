import { useEffect, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { SkeletonBlock, SkeletonLine } from "../../../shared/components/skeleton";
import { TabStrip } from "../../../shared/components/tab-strip";
import { useSettings } from "../../../shared/context/settings-context";
import type { Freshness } from "../../../types/api/Freshness";
import type { Rashifal } from "../../../types/api/Rashifal";
import type { RashifalPeriod } from "../../../types/api/RashifalPeriod";
import type { RashiSign } from "../../../types/api/RashiSign";
import { isReadingFromToday } from "../_lib/format";
import { signMeta } from "../_lib/signs";

export const PERIODS: readonly RashifalPeriod[] = ["daily", "weekly", "monthly", "yearly"];

/** Past this many characters a reading is folded behind "Read more": a
 * year's reading runs to ~2,000, which is several screens in the popover. */
const FOLD_AT = 600;

export function ReadingCard({
  sign,
  reading,
  freshness,
  isMine,
  onSetMine,
  allReadings = [],
  period,
  onPeriod,
  title,
}: {
  sign: RashiSign;
  reading: Rashifal | undefined;
  /** Every sign's reading today. Laid in the same spot, unseen, so the card
   * is always as tall as the longest and nothing below it jumps when
   * switching signs. */
  allReadings?: readonly Rashifal[];
  freshness: Freshness | undefined;
  isMine: boolean;
  onSetMine: () => void;
  period: RashifalPeriod;
  onPeriod: (period: RashifalPeriod) => void;
  /** The span as the source names it, e.g. "मासिक राशिफल असोज २०८३". */
  title?: string | null;
}) {
  const { t } = useSettings();
  const meta = signMeta(sign);
  const daily = period === "daily";
  // Only a daily reading can be "for an earlier day"; a week's reading
  // fetched yesterday is still this week's.
  const fromToday = !daily || isReadingFromToday(freshness);
  const long = (reading?.prediction.length ?? 0) > FOLD_AT;
  const [expanded, setExpanded] = useState(false);
  // A new sign or span starts folded again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on sign/period change
  useEffect(() => setExpanded(false), [sign, period]);
  const folded = long && !expanded;

  return (
    <section className="surface-card space-y-2.5 p-3">
      <div className="flex items-center gap-3">
        <span className="rashi-glyph" aria-hidden="true">
          {meta.glyph}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[18px] font-semibold leading-tight tracking-tight">
            {meta.ne} <span className="text-text-muted">·</span> {meta.en}
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {meta.western} ·{" "}
            {isMine
              ? daily
                ? t("rashifal.yours")
                : t("rashifal.is-mine")
              : daily
                ? t("rashifal.looking-up")
                : t(`rashifal.period-${period}`)}
          </p>
        </div>
      </div>

      <TabStrip
        label={t("rashifal.period")}
        value={period}
        onChange={onPeriod}
        tabs={PERIODS.map((id) => ({ id, label: t(`rashifal.period-${id}`) }))}
      />
      {title && <p className="-mt-1 text-[10px] text-text-muted">{title}</p>}

      <div className="grid">
        {/* Daily readings are short: every sign's is laid in unseen so the
            card keeps one height across signs. Longer spans fold instead. */}
        {(daily ? allReadings : []).map((other) => (
          <p
            key={other.sign}
            aria-hidden="true"
            className="invisible col-start-1 row-start-1 text-[13px] leading-[1.65] whitespace-pre-line"
          >
            {other.prediction}
          </p>
        ))}
        {reading ? (
          <p
            className={`col-start-1 row-start-1 text-[13px] leading-[1.65] whitespace-pre-line ${
              folded ? "line-clamp-[9]" : ""
            }`}
          >
            {reading.prediction}
          </p>
        ) : (
          <p className="col-start-1 row-start-1 text-[12px] text-text-secondary">
            {t("rashifal.unavailable")}
          </p>
        )}
      </div>

      {long && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="-mt-1 text-[11px] font-medium text-[color:var(--color-accent-mark)] hover:underline"
        >
          {expanded ? t("rashifal.read-less") : t("rashifal.read-more")}
        </button>
      )}

      {daily && (reading?.luckyColour || reading?.luckyNumber) && (
        <div className="flex flex-wrap gap-1.5">
          {reading.luckyColour && (
            <span className="rounded-md bg-[color-mix(in_srgb,var(--color-accent-mark)_14%,transparent)] px-1.5 text-[10px] leading-5 text-text-secondary">
              {t("rashifal.lucky-colour")}{" "}
              <span className="font-semibold text-text">{reading.luckyColour}</span>
            </span>
          )}
          {reading.luckyNumber && (
            <span className="rounded-md bg-[color-mix(in_srgb,var(--color-accent-mark)_14%,transparent)] px-1.5 text-[10px] leading-5 text-text-secondary">
              {t("rashifal.lucky-number")}{" "}
              <span className="font-semibold text-text tabular-nums">{reading.luckyNumber}</span>
            </span>
          )}
        </div>
      )}

      {!fromToday && (
        <p className="flex items-center gap-1.5 text-[10px] text-text-muted">
          <Icon name="clock" className="size-3 shrink-0 opacity-70" />
          {t("rashifal.stale")}
        </p>
      )}

      {/* The same row either way, so the card keeps its height: a button
          for another sign, a quiet label for yours. */}
      {isMine ? (
        <p className="flex h-[26px] items-center gap-1.5 text-[11px] text-text-secondary">
          <Icon name="starFill" className="size-3 text-accent-mark" />
          {t("rashifal.is-mine")}
        </p>
      ) : (
        <button type="button" onClick={onSetMine} className="settings-btn h-[26px]">
          <Icon name="star" className="size-3 text-accent-mark" />
          {t("rashifal.set-mine")}
        </button>
      )}
    </section>
  );
}

/** The reading card while the day's readings load: same header, four lines of text. */
export function ReadingCardSkeleton() {
  return (
    <section className="surface-card space-y-2.5 p-3">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="size-12 shrink-0 rounded-[14px]" />
        <div className="min-w-0 flex-1">
          <SkeletonLine className="text-[18px] leading-tight" bar="w-2/5" />
          <SkeletonLine className="mt-0.5 text-[11px]" bar="w-1/3" />
        </div>
      </div>
      <div>
        {["w-full", "w-11/12", "w-full", "w-3/5"].map((bar, line) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder lines
          <SkeletonLine key={line} className="text-[13px] leading-[1.65]" bar={bar} />
        ))}
      </div>
    </section>
  );
}
