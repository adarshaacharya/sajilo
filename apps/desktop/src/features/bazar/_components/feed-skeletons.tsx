import type { ReactNode } from "react";
import { SkeletonBlock, SkeletonLine } from "../../../shared/components/skeleton";

/** The published-at line and source link every feed ends with (`SourceNote`). */
function SourceNoteSkeleton() {
  return (
    <div className="px-0.5 text-[10px]">
      <SkeletonLine bar="w-2/5" />
      <SkeletonLine className="mt-0.5" bar="w-3/5" />
    </div>
  );
}

/** Two-line name on the left, price stack on the right, as the feed rows draw it. */
function PriceRowSkeleton({
  className,
  price,
  sub = "text-[11px]",
  lead,
}: {
  className: string;
  /** Type classes of the price line, and of the line under it. */
  price: string;
  sub?: string;
  lead?: ReactNode;
}) {
  return (
    <div className={`row-line flex items-center ${className}`}>
      {lead}
      <div className="min-w-0 flex-1">
        <SkeletonLine className="text-[13px]" bar="w-1/3" />
        <SkeletonLine className="text-[11px]" bar="w-1/4" />
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <SkeletonLine className={price} bar="w-20" />
        <SkeletonLine className={sub} bar="w-14" />
      </div>
    </div>
  );
}

/** `MetalsTab`: the headline metal, the rest, the calculator, the source. */
export function MetalsSkeleton() {
  return (
    <div className="space-y-2.5">
      <section className="surface-card p-2.5">
        <SkeletonLine className="text-[11px]" bar="w-1/4" />
        <SkeletonLine className="text-[10px]" bar="w-1/6" />
        <SkeletonBlock className="mt-1 h-8 w-1/2" />
        <div className="mt-2 flex items-end justify-between gap-2">
          <SkeletonLine className="flex-1 text-[11px]" bar="w-4/5" />
          <SkeletonBlock className="h-[22px] w-[88px] shrink-0" />
        </div>
      </section>

      <section className="surface-card px-3 py-0.5">
        <PriceRowSkeleton
          className="gap-2.5 py-2.5"
          price="text-[15px] leading-tight"
          lead={<SkeletonBlock className="size-2.5 shrink-0 rounded-full" />}
        />
      </section>

      <section className="surface-card p-2.5">
        <SkeletonLine className="mb-2 text-[11px]" bar="w-1/5" />
        <div className="grid grid-cols-[minmax(0,1fr)_72px_minmax(94px,1.15fr)] gap-2">
          <SkeletonBlock className="h-[22px] rounded-[5px]" />
          <SkeletonBlock className="h-[22px] rounded-[5px]" />
          <SkeletonBlock className="h-[22px] rounded-[5px]" />
        </div>
        <SkeletonLine className="mt-2 text-[16px]" bar="w-2/5" />
      </section>

      <SourceNoteSkeleton />
    </div>
  );
}

/** `FuelTab`: one row per fuel NOC prices (petrol, diesel, kerosene, LPG). */
export function FuelSkeleton() {
  return (
    <div className="space-y-2.5">
      <section className="surface-card px-3 py-0.5">
        {Array.from({ length: 4 }, (_, row) => (
          <PriceRowSkeleton
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder rows
            key={row}
            className="gap-3 py-2.5"
            price="text-[18px] leading-none"
            sub="mt-0.5 text-[11px]"
          />
        ))}
      </section>
      <SourceNoteSkeleton />
    </div>
  );
}

/** `VegetablesTab`: the search field, then produce rows; the list runs past the fold. */
export function VegetablesSkeleton() {
  return (
    <div className="space-y-2.5">
      <SkeletonBlock className="h-[22px] w-full rounded-[5px]" />
      <section className="surface-card p-2.5">
        {Array.from({ length: 10 }, (_, row) => (
          <PriceRowSkeleton
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder rows
            key={row}
            className="gap-1.5 py-2"
            price="text-[13px]"
            lead={<span className="size-4 shrink-0" />}
          />
        ))}
      </section>
    </div>
  );
}
