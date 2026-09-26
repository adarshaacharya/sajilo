import { SkeletonBlock, SkeletonLine } from "../../../shared/components/skeleton";

const NAME_BARS = ["w-2/5", "w-1/2", "w-1/3", "w-3/5", "w-2/5", "w-1/2", "w-1/3", "w-2/5"];

/**
 * The station directory while it loads: the search field, the pinned tiles
 * when anything is pinned, then station rows at `StationRow`'s size.
 */
export function RadioSkeleton({ pinned }: { pinned: number }) {
  const tiles = Math.min(pinned, 8);
  // Its own space-y: the real rows sit directly in the screen's stack, this
  // sits one level down inside the loading wrapper.
  return (
    <div className="space-y-2.5">
      <SkeletonBlock className="h-[22px] w-full rounded-[5px]" />

      {tiles > 0 && (
        <section className="mt-2 space-y-1.5">
          <SkeletonLine className="px-0.5 text-[11px]" bar="w-1/5" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: tiles }, (_, tile) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder tiles
                key={tile}
                className="surface-card flex min-w-0 flex-col items-center gap-1.5 px-1 py-2"
              >
                <SkeletonBlock className="size-9 rounded-[7px]" />
                <SkeletonLine className="w-full text-center text-[10px]" bar="w-3/4" />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="surface-card mt-2 p-1">
        <SkeletonLine className="px-1.5 pt-1 text-[11px]" bar="w-1/5" />
        {NAME_BARS.map((bar, row) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder rows
            key={row}
            className="row-line flex items-center gap-1.5 px-1.5 py-2"
          >
            <span className="size-4 shrink-0" />
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <SkeletonBlock className="size-[30px] shrink-0 rounded-[6px]" />
              <div className="min-w-0 flex-1">
                <SkeletonLine className="text-[12px]" bar={bar} />
                <SkeletonLine className="text-[10px]" bar="w-12" />
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
