import type { AqiCategory } from "../../../types/api/AqiCategory";
import type { WeatherCondition } from "../../../types/api/WeatherCondition";

const TITLES: Record<WeatherCondition, string> = {
  clear: "Clear",
  partlyCloudy: "Partly cloudy",
  overcast: "Overcast",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  snow: "Snow",
  showers: "Showers",
  thunderstorm: "Thunderstorm",
  unknown: "Weather unavailable",
};

const PRECIP: ReadonlySet<WeatherCondition> = new Set([
  "drizzle",
  "rain",
  "snow",
  "showers",
  "thunderstorm",
]);

export function conditionTitle(condition: WeatherCondition): string {
  return TITLES[condition];
}

export function hasPrecipitation(condition: WeatherCondition): boolean {
  return PRECIP.has(condition);
}

export function formatCelsius(value: number): string {
  return `${Math.round(value)}°`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function aqiCategory(value: number): AqiCategory {
  if (value <= 50) return "good";
  if (value <= 100) return "moderate";
  if (value <= 150) return "unhealthyForSensitive";
  if (value <= 200) return "unhealthy";
  if (value <= 300) return "veryUnhealthy";
  return "hazardous";
}

/** EPA band colours for the AQI scale bar. */
export function aqiColor(category: AqiCategory): string {
  switch (category) {
    case "good":
      return "#4ecf8a";
    case "moderate":
      return "#e8c84a";
    case "unhealthyForSensitive":
      return "#f5a623";
    case "unhealthy":
      return "#f2555a";
    case "veryUnhealthy":
      return "#b84dc7";
    case "hazardous":
      return "#8b2948";
  }
}

export function forecastWeekday(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short" });
}
