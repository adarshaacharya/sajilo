import { Icon } from "../Icon";
import { isReadingFromToday } from "../../lib/rashifal";
import { useSettings } from "../../lib/settings";
import type { Freshness } from "../../types/api/Freshness";
import type { Rashifal } from "../../types/api/Rashifal";
import { signMeta } from "./signs";
import type { RashiSign } from "../../types/api/RashiSign";

export function ReadingCard({
  sign,
  reading,
  freshness,
  isMine,
  onChangeSign,
  onBackToMine,
}: {
  sign: RashiSign;
  reading: Rashifal | undefined;
  freshness: Freshness | undefined;
  isMine: boolean;
  onChangeSign: () => void;
  onBackToMine: () => void;
}) {
  const { t } = useSettings();
  const meta = signMeta(sign);
  const fromToday = isReadingFromToday(freshness);

  return (
    <section className="surface-card rashifal-reading p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[20px] font-semibold leading-none tracking-tight">{meta.ne}</p>
          <p className="mt-1 text-[10px] text-text-muted">
            {meta.en} · {meta.western}
          </p>
        </div>
        <button
          type="button"
          onClick={isMine ? onChangeSign : onBackToMine}
          className="btn-ghost shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-accent-mark"
        >
          {isMine ? t("rashifal.change-sign") : t("rashifal.back-to-mine")}
        </button>
      </div>

      <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-text-muted">
        {meta.syllables.join(" · ")}
      </p>

      <div className="my-2.5 h-px bg-divider" />

      {reading ? (
        <p className="text-[13px] leading-[1.6] whitespace-pre-line">{reading.prediction}</p>
      ) : (
        <p className="text-[12px] text-text-secondary">{t("rashifal.unavailable")}</p>
      )}

      {!fromToday && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[10px] text-text-muted">
          <Icon name="clock" className="size-3 shrink-0 opacity-70" />
          {t("rashifal.stale")}
        </p>
      )}
    </section>
  );
}
