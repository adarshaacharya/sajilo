import { SkeletonBlock, SkeletonLine } from "../../../shared/components/skeleton";

/** Title lines per row: real headlines wrap to one or two lines about evenly. */
const TITLE_BARS = [
  ["w-full", "w-3/5"],
  ["w-full", "w-2/5"],
  ["w-4/5"],
  ["w-full", "w-3/4"],
  ["w-3/4"],
  ["w-10/12", "w-3/5"],
  ["w-full", "w-1/2"],
  ["w-2/3"],
];

/**
 * The headline list while the first digest loads: the source picker, the
 * government notices row when showing every source, then headline rows built
 * from `HeadlineRow`'s own padding and type.
 */
export function NewsSkeleton({ showNotices }: { showNotices: boolean }) {
  return (
    <>
      <SkeletonBlock className="mb-2 h-[22px] w-full rounded-[5px]" />

      {showNotices && (
        <div className="surface-card mb-2 flex items-center gap-2.5 p-2.5">
          <SkeletonBlock className="size-8 shrink-0 rounded-[8px]" />
          <div className="min-w-0 flex-1">
            <SkeletonLine className="text-[12px]" bar="w-2/5" />
            <SkeletonLine className="text-[11px]" bar="w-4/5" />
          </div>
        </div>
      )}

      <div className="surface-card overflow-hidden">
        {TITLE_BARS.map((bars, row) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder rows
            key={row}
            className="border-b border-divider py-2.5 pr-7 pl-3 last:border-b-0"
          >
            <SkeletonLine className="text-[10px]" bar="w-1/4" />
            <div className="mt-0.5">
              {bars.map((bar) => (
                <SkeletonLine key={bar} className="text-[13px] leading-snug" bar={bar} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
