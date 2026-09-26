import { SkeletonBlock, SkeletonLine } from "../../../shared/components/skeleton";

/** The converter while rates load: the amount row, the result, its footnote. */
export function ConverterSkeleton() {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-[22px] min-w-0 flex-1 rounded-[5px]" />
        <SkeletonBlock className="h-[22px] w-24 shrink-0 rounded-[5px]" />
        <SkeletonBlock className="size-[26px] shrink-0 rounded-[6px]" />
      </div>
      <SkeletonLine className="text-[18px] leading-snug" bar="w-1/2" />
      <SkeletonLine className="text-[11px]" bar="w-2/3" />
    </div>
  );
}

/** A card of `ForexRateRow`s: code and name left, buy and sell right. */
export function RateCardSkeleton({ rows }: { rows: number }) {
  return (
    <section className="surface-card p-2.5">
      <SkeletonLine className="mb-1 text-[11px]" bar="w-1/4" />
      {Array.from({ length: rows }, (_, row) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder rows
        <div key={row} className="row-line flex items-baseline justify-between gap-3 py-2">
          <div className="min-w-0 flex-1">
            <SkeletonLine className="text-[13px]" bar="w-16" />
            <SkeletonLine className="text-[11px]" bar="w-24" />
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <SkeletonLine className="text-[13px]" bar="w-14" />
            <SkeletonLine className="text-[11px]" bar="w-16" />
          </div>
        </div>
      ))}
    </section>
  );
}
