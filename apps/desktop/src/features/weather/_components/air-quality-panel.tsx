import type { AirQuality } from "../../../types/api/AirQuality";
import type { AqiCategory } from "../../../types/api/AqiCategory";
import { aqiCategory, aqiColor } from "../_lib/format";

const BANDS: AqiCategory[] = [
  "good",
  "moderate",
  "unhealthyForSensitive",
  "unhealthy",
  "veryUnhealthy",
  "hazardous",
];

/** The scale's bands, equal width on the gauge though not in AQI points. */
const EDGES = [0, 50, 100, 150, 200, 300, 500];

const GAUGE = `linear-gradient(90deg, ${BANDS.map(
  (band, index) =>
    `${aqiColor(band)} ${(index / BANDS.length) * 100}% ${((index + 1) / BANDS.length) * 100}%`,
).join(", ")})`;

/** Where a reading sits on the gauge, 0–1, within its own band's segment. */
function gaugePosition(aqi: number): number {
  const band = EDGES.findIndex((edge, index) => index > 0 && aqi <= edge);
  if (band === -1) return 1;
  const low = EDGES[band - 1] ?? 0;
  const high = EDGES[band] ?? 500;
  return (band - 1 + (aqi - low) / (high - low)) / BANDS.length;
}

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
  // Pulled toward the text colour so yellow stays legible on a light card.
  const tint = `color-mix(in srgb, ${aqiColor(category)} 72%, var(--color-text))`;
  const position = gaugePosition(airQuality.usAqi);

  return (
    <section className="surface-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold text-text-secondary">{title}</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-semibold tabular-nums" style={{ color: tint }}>
            {airQuality.usAqi}
          </span>
          <span className="text-[11px] font-medium" style={{ color: tint }}>
            {categoryLabel}
          </span>
        </div>
      </div>

      <div className="relative mt-2.5 h-2 rounded-full" style={{ background: GAUGE }}>
        <div
          className="aqi-marker absolute -top-1 h-4 w-1 rounded-full"
          style={{ left: `calc(${position * 100}% - 2px)` }}
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
