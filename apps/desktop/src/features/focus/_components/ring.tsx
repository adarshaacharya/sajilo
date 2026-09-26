import { Icon, type IconName } from "../../../shared/components/icon";

const RADIUS = 27;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The next break as a small ring that fills while it comes closer, with the
 * minutes left in the middle. Shared by the Routine tab and its card on Today.
 */
export function Ring({
  fraction,
  color,
  label,
  size,
  resting = false,
  due = false,
}: {
  fraction: number;
  color: string;
  label: string;
  size: number;
  resting?: boolean;
  due?: boolean;
}) {
  const fill = Math.min(1, Math.max(0, fraction));
  return (
    <span
      className={`focus-ring relative inline-flex shrink-0 items-center justify-center ${
        due ? "focus-ring--due" : ""
      } ${resting && !due ? "focus-ring--resting" : ""}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 64 64" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle
          cx="32"
          cy="32"
          r={RADIUS}
          fill="none"
          stroke="var(--color-divider)"
          strokeWidth="6"
        />
        <circle
          className="focus-ring__fill"
          cx="32"
          cy="32"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fill)}
        />
      </svg>
      <span
        className="relative font-bold tabular-nums leading-none"
        style={{ fontSize: Math.round(size * 0.22) }}
      >
        {label}
      </span>
    </span>
  );
}

/** An icon in a soft disc of its own colour. */
export function Chip({ icon, tint, size = 40 }: { icon: IconName; tint: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        color: tint,
        background: `color-mix(in srgb, ${tint} 16%, transparent)`,
      }}
    >
      <Icon name={icon} className={size >= 36 ? "size-[18px]" : "size-3.5"} />
    </span>
  );
}
