import { Icon } from "../../../shared/components/icon";
import { SkeletonBlock, SkeletonLine } from "../../../shared/components/skeleton";
import { useSettings } from "../../../shared/context/settings-context";
import type { Freshness } from "../../../types/api/Freshness";
import type { Rashifal } from "../../../types/api/Rashifal";
import type { RashiSign } from "../../../types/api/RashiSign";
import { isReadingFromToday } from "../_lib/format";
import { signMeta } from "../_lib/signs";

export function ReadingCard({
  sign,
  reading,
  freshness,
  isMine,
  onSetMine,
}: {
  sign: RashiSign;
  reading: Rashifal | undefined;
  freshness: Freshness | undefined;
  isMine: boolean;
  onSetMine: () => void;
}) {
  const { t } = useSettings();
  const meta = signMeta(sign);
  const fromToday = isReadingFromToday(freshness);

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
            {meta.western} · {isMine ? t("rashifal.yours") : t("rashifal.looking-up")}
          </p>
        </div>
      </div>

      {reading ? (
        <p className="text-[13px] leading-[1.65] whitespace-pre-line">{reading.prediction}</p>
      ) : (
        <p className="text-[12px] text-text-secondary">{t("rashifal.unavailable")}</p>
      )}

      {!fromToday && (
        <p className="flex items-center gap-1.5 text-[10px] text-text-muted">
          <Icon name="clock" className="size-3 shrink-0 opacity-70" />
          {t("rashifal.stale")}
        </p>
      )}

      {!isMine && (
        <button type="button" onClick={onSetMine} className="settings-btn">
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
