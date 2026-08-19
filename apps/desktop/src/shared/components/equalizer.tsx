/**
 * Modest playback bars — not a real meter (live streams don't expose levels).
 * Matches Swift `EqualizerView`: animates only while playing.
 */
export function Equalizer({
  isPlaying,
  className = "",
}: {
  isPlaying: boolean;
  className?: string;
}) {
  return (
    <span className={`eq ${isPlaying ? "eq-playing" : ""} ${className}`} aria-hidden="true">
      <span className="eq-bar" />
      <span className="eq-bar" />
      <span className="eq-bar" />
      <span className="eq-bar" />
    </span>
  );
}
