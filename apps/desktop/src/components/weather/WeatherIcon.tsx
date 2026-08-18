import type { ComponentType } from "react";
import { SFCloudBoltRainFill } from "sf-symbols-lib/monochrome/SFCloudBoltRainFill";
import { SFCloudDrizzleFill } from "sf-symbols-lib/monochrome/SFCloudDrizzleFill";
import { SFCloudFill } from "sf-symbols-lib/monochrome/SFCloudFill";
import { SFCloudFogFill } from "sf-symbols-lib/monochrome/SFCloudFogFill";
import { SFCloudHeavyrainFill } from "sf-symbols-lib/monochrome/SFCloudHeavyrainFill";
import { SFCloudRainFill } from "sf-symbols-lib/monochrome/SFCloudRainFill";
import { SFCloudSnowFill } from "sf-symbols-lib/monochrome/SFCloudSnowFill";
import { SFCloudSunFill } from "sf-symbols-lib/monochrome/SFCloudSunFill";
import { SFSunMaxFill } from "sf-symbols-lib/monochrome/SFSunMaxFill";
import type { WeatherCondition } from "../../types/api/WeatherCondition";

const GLYPHS: Record<WeatherCondition, ComponentType<{ size?: number; className?: string }>> = {
  clear: SFSunMaxFill,
  partlyCloudy: SFCloudSunFill,
  overcast: SFCloudFill,
  fog: SFCloudFogFill,
  drizzle: SFCloudDrizzleFill,
  rain: SFCloudRainFill,
  snow: SFCloudSnowFill,
  showers: SFCloudHeavyrainFill,
  thunderstorm: SFCloudBoltRainFill,
  unknown: SFCloudFill,
};

export function WeatherIcon({
  condition,
  className = "size-4",
  size,
}: {
  condition: WeatherCondition;
  className?: string;
  size?: number;
}) {
  const Comp = GLYPHS[condition];
  return <Comp size={size ?? 16} className={className} />;
}
