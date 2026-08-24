import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import type { Panchanga } from "../../../shared/lib/ipc";

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function daylightText(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function Reading({
  icon,
  label,
  value,
}: {
  icon: "sunrise" | "sunset" | "clock";
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1 text-[10px] text-text-muted">
        <Icon name={icon} className="size-2.5 shrink-0 opacity-70" />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-0.5 text-[13px] font-medium tabular-nums">{value}</p>
    </div>
  );
}

export function PanchangaPanel({ panchanga }: { panchanga: Panchanga }) {
  const { t } = useSettings();

  return (
    <section className="surface-card p-3">
      <p className="mb-2 text-[11px] font-semibold text-text-secondary">{t("panchanga.title")}</p>

      <div className="flex gap-2">
        <Reading
          icon="sunrise"
          label={t("panchanga.sunrise")}
          value={clockTime(panchanga.sunrise)}
        />
        <Reading icon="sunset" label={t("panchanga.sunset")} value={clockTime(panchanga.sunset)} />
        <Reading
          icon="clock"
          label={t("panchanga.daylight")}
          value={daylightText(panchanga.daylightSeconds)}
        />
      </div>

      {panchanga.rahuKaalStart && panchanga.rahuKaalEnd && (
        <>
          <div className="my-2.5 h-px bg-divider" />
          <div className="flex items-start gap-2">
            <Icon name="warning" className="mt-0.5 size-3.5 shrink-0 text-holiday" />
            <div className="min-w-0">
              <p className="text-[12px] font-medium tabular-nums">
                {t("panchanga.rahu-kaal")} {clockTime(panchanga.rahuKaalStart)}–
                {clockTime(panchanga.rahuKaalEnd)}
              </p>
              <p className="mt-0.5 text-[10px] leading-snug text-text-muted">
                {t("panchanga.rahu-note")}
              </p>
            </div>
          </div>
        </>
      )}

      <p className="mt-2 text-[10px] text-text-muted">{t("panchanga.computed")}</p>
    </section>
  );
}
