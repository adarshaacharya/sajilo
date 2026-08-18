import type { AqiCategory } from "../types/api/AqiCategory";
import type { WeatherCondition } from "../types/api/WeatherCondition";

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

export function conditionTitle(condition: WeatherCondition): string {
  return TITLES[condition];
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
