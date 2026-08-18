import type { AirQuality } from "../../types/api/AirQuality";
import type { AqiCategory } from "../../types/api/AqiCategory";
import { aqiCategory, aqiColor } from "../../lib/weather";

const BANDS: AqiCategory[] = [
  "good",
  "moderate",
  "unhealthyForSensitive",
  "unhealthy",
  "veryUnhealthy",
  "hazardous",
];

export function AirQualityPanel({
  airQuality,
  title,
  categoryLabel,
  advice,
  pm25Label,
  pm10Label,
}: {
  airQuality: AirQuality;
  title: string;
  categoryLabel: string;
  advice: string;
  pm25Label: string;
  pm10Label: string;
}) {
  const category = aqiCategory(airQuality.usAqi);
  const tint = aqiColor(category);
  const position = Math.min(airQuality.usAqi / 500, 1);

  return (
    <section className="surface-card p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          {title}
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-semibold tabular-nums" style={{ color: tint }}>
            {airQuality.usAqi}
          </span>
          <span className="text-[11px] font-medium" style={{ color: tint }}>
            {categoryLabel}
          </span>
        </div>
      </div>

      <div className="relative mt-2 h-1.5 overflow-hidden rounded-full">
        <div className="flex h-full gap-px">
          {BANDS.map((band) => (
            <div
              key={band}
              className="h-full flex-1"
              style={{
                background: aqiColor(band),
                opacity: band === category ? 0.95 : 0.28,
              }}
            />
          ))}
        </div>
        <div
          className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded-full bg-white shadow"
          style={{ left: `calc(${position * 100}% - 1px)` }}
        />
      </div>

      <p className="mt-2 text-[11px] leading-snug text-text-secondary">{advice}</p>

      <div className="mt-2 flex gap-4 text-[11px]">
        <div>
          <span className="text-text-muted">{pm25Label}</span>{" "}
          <span className="font-medium tabular-nums">{Math.round(airQuality.pm25)} µg/m³</span>
        </div>
        <div>
          <span className="text-text-muted">{pm10Label}</span>{" "}
          <span className="font-medium tabular-nums">{Math.round(airQuality.pm10)} µg/m³</span>
        </div>
      </div>
    </section>
  );
}
