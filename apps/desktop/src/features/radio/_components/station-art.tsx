import { useState } from "react";
import { Equalizer } from "../../../shared/components/equalizer";

export function StationArt({
  station,
  isPlaying,
  size = 30,
}: {
  station: { logoUrl?: string | null; name: string };
  isPlaying: boolean;
  size?: number;
}) {
  const rounded = Math.max(6, Math.round(size * 0.2));
  // The URL that failed, not a flag: a different station's logo gets its own try.
  const [failed, setFailed] = useState<string | null>(null);

  // A logo that is gone, moved or unreachable offline falls back to the same
  // tile as a station with none, never the browser's broken-image glyph.
  if (station.logoUrl && failed !== station.logoUrl) {
    const url = station.logoUrl;
    return (
      <img
        src={url}
        alt=""
        onError={() => setFailed(url)}
        className="station-art shrink-0 object-cover bg-surface-raised"
        style={{ width: size, height: size, borderRadius: rounded }}
      />
    );
  }

  // No logo, or one that failed: the station's initial on a colour of its
  // own, so a list of logo-less stations still tells them apart. While it
  // plays, the equaliser takes the letter's place.
  const hue = hueOf(station.name);
  return (
    <span
      className="flex shrink-0 items-center justify-center font-bold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        background: `hsl(${hue} 55% 42%)`,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {isPlaying ? <Equalizer isPlaying /> : initialOf(station.name)}
    </span>
  );
}

/** "Radio Kantipur" → "K": the word that names the station, not "Radio". */
function initialOf(name: string): string {
  const words = name.split(/\s+/).filter((word) => !/^(radio|fm|रेडियो|एफएम)$/i.test(word));
  return Array.from(words[0] ?? name)[0]?.toUpperCase() ?? "•";
}

/** A steady hue per station name, so the same station keeps its colour. */
function hueOf(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360;
  return hash;
}
