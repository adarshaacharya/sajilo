/** A game's record as a row of small numbers, each with its label under it:
 * on a game's start screen and its finish screen alike. */
export function StatTiles({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <div
      className="grid gap-1.5 text-center"
      style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
    >
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-[6px] bg-surface-hover px-1 py-1.5">
          <p className="truncate text-[15px] font-semibold tabular-nums">{stat.value}</p>
          <p className="truncate text-[9.5px] text-text-muted">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
