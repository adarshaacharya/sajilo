import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { SkeletonBlock, SkeletonLine } from "../../../shared/components/skeleton";
import { TabStrip } from "../../../shared/components/tab-strip";
import { useSettings } from "../../../shared/context/settings-context";
import type { Freshness } from "../../../types/api/Freshness";
import type { Rashifal } from "../../../types/api/Rashifal";
import type { RashifalPeriod } from "../../../types/api/RashifalPeriod";
import type { RashiSign } from "../../../types/api/RashiSign";
import { isReadingFromToday } from "../_lib/format";
import { swatchFor } from "../_lib/lucky";
import { signMeta } from "../_lib/signs";

export const PERIODS: readonly RashifalPeriod[] = ["daily", "weekly", "monthly", "yearly"];

export function ReadingCard({
  sign,
  reading,
  freshness,
  isMine,
  onSetMine,
  period,
  onPeriod,
  title,
}: {
  sign: RashiSign;
  reading: Rashifal | undefined;
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
  const [expanded, setExpanded] = useState(false);
  // A new sign or span starts folded again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on sign/period change
  useEffect(() => setExpanded(false), [sign, period]);
  // Whether the folded text runs past its six lines: measured, not guessed
  // from a character count, so "Read more" shows exactly when text is hidden.
  const textRef = useRef<HTMLParagraphElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const prediction = reading?.prediction;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text changes
  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return;
    const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [prediction, expanded]);

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
      {/* Six lines, always: a short reading keeps the space, a long one folds
          with "Read more" over its last line. With the fixed row below, the
          card is one height across signs and spans, so nothing jumps. */}
      <div className="relative">
        {reading ? (
          <p
            ref={textRef}
            className={`min-h-[9.9em] text-[13px] leading-[1.65] whitespace-pre-line ${
              expanded ? "" : "line-clamp-6"
            }`}
          >
            {reading.prediction}
          </p>
        ) : (
          <p className="min-h-[9.9em] text-[12px] text-text-secondary">
            {t("rashifal.unavailable")}
          </p>
        )}
        {overflowing && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="reading-more absolute right-0 bottom-0 text-[13px] leading-[1.65] font-medium text-[color:var(--color-accent-mark)] hover:underline"
          >
            {t("rashifal.read-more")}
          </button>
        )}
      </div>
      {expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="-mt-1 text-[11px] font-medium text-[color:var(--color-accent-mark)] hover:underline"
        >
          {t("rashifal.read-less")}
        </button>
      )}

      {/* One fixed row: today's lucky colour and number, or the span's
          title for a week, month or year. */}
      <div className="h-[48px]">
        {daily
          ? (reading?.luckyColour || reading?.luckyNumber) && (
              <div className="grid h-full grid-cols-2 gap-1.5">
                {reading.luckyColour && (
                  <div className="lucky-tile">
                    <span className="lucky-tile__label">{t("rashifal.lucky-colour")}</span>
                    <span className="lucky-tile__value">
                      {swatchFor(reading.luckyColour) && (
                        <span
                          aria-hidden="true"
                          className="lucky-tile__swatch"
                          style={{ background: swatchFor(reading.luckyColour) ?? undefined }}
                        />
                      )}
                      <span className="truncate">{reading.luckyColour}</span>
                    </span>
                  </div>
                )}
                {reading.luckyNumber && (
                  <div className="lucky-tile">
                    <span className="lucky-tile__label">{t("rashifal.lucky-number")}</span>
                    <span className="lucky-tile__value lucky-tile__value--number">
                      {reading.luckyNumber}
                    </span>
                  </div>
                )}
              </div>
            )
          : title && (
              <div className="lucky-tile h-full justify-center">
                <span className="lucky-tile__label">{t(`rashifal.period-${period}`)}</span>
                <span className="truncate text-[12px] font-medium text-text-secondary">
                  {title}
                </span>
              </div>
            )}
      </div>

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
