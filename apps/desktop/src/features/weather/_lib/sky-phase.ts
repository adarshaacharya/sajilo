/** Time of day at the weather location — tints the detail backdrop. */
export type SkyPhase = "night" | "dawn" | "day" | "dusk";

const TWILIGHT_MS = 45 * 60 * 1000;

export function currentSkyPhase(
  sunrise: string | null,
  sunset: string | null,
  now = new Date(),
): SkyPhase {
  if (!sunrise || !sunset) return fallbackPhase(now);

  const rise = new Date(sunrise).getTime();
  const set = new Date(sunset).getTime();
  const t = now.getTime();

  if (t < rise - TWILIGHT_MS) return "night";
  if (t < rise + TWILIGHT_MS) return "dawn";
  if (t < set - TWILIGHT_MS) return "day";
  if (t < set + TWILIGHT_MS) return "dusk";
  return "night";
}

function fallbackPhase(now: Date): SkyPhase {
  const hour = now.getHours();
  if (hour < 5 || hour >= 20) return "night";
  if (hour < 7) return "dawn";
  if (hour < 17) return "day";
  return "dusk";
}
