import type { ReactNode } from "react";
import { useSettings } from "../../../shared/context/settings-context";
import type { Almanac, AlmanacName } from "../../../shared/lib/ipc";
import { nepalClock, nepalDay } from "../_lib/panchang-time";
import { MoonDisc } from "./moon-disc";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[10px] text-text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-[12px]">{children}</dd>
    </div>
  );
}

/**
 * The day's panchang: tithi, nakshatra, yoga and karana with when each ends,
 * the moon, the season and the Nepal Sambat date. Everything is computed in
 * Rust for Kathmandu; this lays it out.
 */
export function AlmanacPanel({ almanac, date }: { almanac: Almanac; date: string }) {
  const { t, language } = useSettings();
  const name = (item: AlmanacName) => (language === "ne" ? item.ne : item.en);

  // An ending after midnight belongs to the next morning, and says so.
  const until = (item: AlmanacName) => {
    if (!item.ends) return null;
    const time = nepalClock(item.ends);
    const later = nepalDay(item.ends) !== date;
    return (
      <span className="ml-1.5 text-[10px] tabular-nums text-text-muted">
        {t("panchang.until").replace(
          "{time}",
          later ? `${time} ${t("panchang.next-morning")}` : time,
        )}
      </span>
    );
  };

  const { moon } = almanac;

  return (
    <section className="surface-card p-3">
      <p className="text-[11px] font-semibold text-text-secondary">{t("panchang.title")}</p>
      <dl className="mt-1 divide-y divide-divider">
        <Row label={t("calendar.tithi")}>
          {name(almanac.tithi)}
          <span className="text-text-muted"> · {name(almanac.paksha)}</span>
          {until(almanac.tithi)}
        </Row>
        <Row label={t("panchang.nakshatra")}>
          {name(almanac.nakshatra)}
          {until(almanac.nakshatra)}
        </Row>
        <Row label={t("panchang.yoga")}>
          {name(almanac.yoga)}
          {until(almanac.yoga)}
        </Row>
        <Row label={t("panchang.karana")}>
          {name(almanac.karana)}
          {until(almanac.karana)}
        </Row>
        <Row label={t("panchang.moon")}>
          <span className="inline-flex items-center gap-1.5">
            <MoonDisc illumination={moon.illumination} waxing={moon.waxing} />
            {name(moon.phase)}
            <span className="text-text-muted">
              · {t("panchang.moon-in").replace("{rashi}", name(moon.rashi))}
            </span>
          </span>
        </Row>
        {(moon.rise || moon.set) && (
          <Row label={t("panchang.moonrise-set")}>
            <span className="tabular-nums">
              {moon.rise ? nepalClock(moon.rise) : "—"}
              <span className="text-text-muted"> / </span>
              {moon.set ? nepalClock(moon.set) : "—"}
            </span>
          </Row>
        )}
        <Row label={t("panchang.season")}>
          {name(almanac.ritu)}
          <span className="text-text-muted"> · {name(almanac.ayan)}</span>
        </Row>
        <Row label={t("panchang.nepal-sambat")}>{almanac.nepalSambat}</Row>
      </dl>
    </section>
  );
}
