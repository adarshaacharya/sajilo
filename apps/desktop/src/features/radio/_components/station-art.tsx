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

  if (station.logoUrl) {
    return (
      <img
        src={station.logoUrl}
        alt=""
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
