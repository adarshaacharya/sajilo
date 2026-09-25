import { useState } from "react";
import { Equalizer } from "../../../shared/components/equalizer";
import { Icon } from "../../../shared/components/icon";

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

  return (
    <span
      className="flex shrink-0 items-center justify-center bg-surface-hover text-[color:var(--color-accent-mark)]"
      style={{ width: size, height: size, borderRadius: rounded }}
    >
      {isPlaying ? <Equalizer isPlaying /> : <Icon name="radio" className="size-3.5" />}
    </span>
  );
}
