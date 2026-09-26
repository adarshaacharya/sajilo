import { SkeletonBlock, SkeletonLine } from "../../../shared/components/skeleton";

/** One `FundRow`: name and NAV line, figure on the right. */
function FundRowSkeleton() {
  return (
    <div className="row-line flex h-[58px] items-center gap-2 px-2">
      <div className="min-w-0 flex-1">
        <SkeletonLine className="text-[13px]" bar="w-3/5" />
        <SkeletonLine className="text-[10px]" bar="w-1/3" />
      </div>
      <SkeletonLine className="text-[13px]" bar="w-14" />
    </div>
  );
}

/**
 * The mutual fund list while it loads: search, "Your funds" (its empty note,
 * or the saved funds under their total), then the fund list under its tabs.
 */
export function FundsSkeleton({ held }: { held: number }) {
  return (
    <div className="space-y-2.5">
      <SkeletonBlock className="h-[22px] w-full rounded-[5px]" />

      <section className="surface-card p-2.5">
        <div className="flex min-h-[20px] items-center">
          <SkeletonLine className="flex-1 text-[11px]" bar="w-1/4" />
        </div>
        {held === 0 ? (
          <div className="mt-1">
            <SkeletonLine className="text-[11px]" bar="w-full" />
            <SkeletonLine className="text-[11px]" bar="w-2/3" />
          </div>
        ) : (
          <>
            <SkeletonLine className="mt-1 text-[22px]" bar="w-2/5" />
            <div className="mt-0.5">
              {Array.from({ length: held }, (_, row) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder rows
                <FundRowSkeleton key={row} />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="surface-card p-2.5 pt-2">
        <SkeletonBlock className="h-[29px] w-full" />
        <div className="mt-1">
          {Array.from({ length: 8 }, (_, row) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder rows
            <FundRowSkeleton key={row} />
          ))}
        </div>
      </section>
    </div>
  );
}
