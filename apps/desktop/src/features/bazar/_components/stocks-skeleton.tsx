import { SkeletonBlock, SkeletonLine } from "../../../shared/components/skeleton";

/** The header the IPO and dividend cards share: a title in a 22px row, and
 * the "see all" button when the card has one. */
function CardHeaderSkeleton({ bar, action }: { bar: string; action?: boolean }) {
  return (
    <div className="flex min-h-[22px] items-center">
      <SkeletonLine className="flex-1 text-[11px]" bar={bar} />
      {action && <SkeletonBlock className="h-[26px] w-12 rounded-[6px]" />}
    </div>
  );
}

/** A mover or dividend row: name left, figure right, at the row's own height. */
function ListRowSkeleton({ height }: { height: string }) {
  return (
    <div className={`row-line flex items-center justify-between gap-2 ${height}`}>
      <SkeletonLine className="text-[13px]" bar="w-16" />
      <SkeletonLine className="text-[13px]" bar="w-20" />
    </div>
  );
}

/** One `QuoteRow`: symbol and a detail line, price on the right. */
function QuoteRowSkeleton() {
  return (
    <div className="row-line flex items-center gap-2 px-1.5 py-1.5">
      <div className="min-w-0 flex-1 py-1">
        <SkeletonLine className="text-[13px]" bar="w-12" />
        <SkeletonLine className="text-[10px]" bar="w-1/2" />
      </div>
      <SkeletonLine className="text-[13px]" bar="w-14" />
    </div>
  );
}

/**
 * The NEPSE view while the market snapshot loads, card for card: search,
 * index with its chart and breadth, IPOs, the watchlist at its saved length,
 * dividends, then the movers.
 */
export function StocksSkeleton({ watching }: { watching: number }) {
  return (
    <div className="space-y-2.5">
      <SkeletonBlock className="h-[22px] w-full rounded-[5px]" />

      <section className="surface-card p-2.5">
        <div className="flex items-center justify-between gap-2">
          <SkeletonLine className="flex-1 text-[11px]" bar="w-1/3" />
          <SkeletonBlock className="h-[20.5px] w-20 rounded-md" />
        </div>
        <SkeletonBlock className="mt-1 h-7 w-2/5" />
        <SkeletonLine className="mt-1.5 text-[11px]" bar="w-1/2" />
        <SkeletonBlock className="mt-2.5 h-[84px] w-full" />
        <SkeletonBlock className="mt-2.5 h-1 w-full rounded-full" />
        <SkeletonLine className="mt-1 text-[10px]" bar="w-full" />
      </section>

      <section className="surface-card p-2.5">
        <CardHeaderSkeleton bar="w-1/5" action />
        <SkeletonLine className="mt-0.5 text-[11px]" bar="w-2/5" />
      </section>

      <section className="surface-card p-2.5">
        <SkeletonLine className="mb-1 text-[11px]" bar="w-1/5" />
        {watching === 0 ? (
          <SkeletonLine className="text-[11px]" bar="w-3/4" />
        ) : (
          Array.from({ length: watching }, (_, row) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder rows
            <QuoteRowSkeleton key={row} />
          ))
        )}
      </section>

      <section className="surface-card p-2.5">
        <CardHeaderSkeleton bar="w-1/4" />
        <div className="mt-0.5">
          <ListRowSkeleton height="h-[52px]" />
        </div>
      </section>

      <section className="surface-card p-2.5 pt-2">
        <SkeletonBlock className="h-[29px] w-full" />
        <div className="mt-1">
          {Array.from({ length: 5 }, (_, row) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder rows
            <ListRowSkeleton key={row} height="h-[34px]" />
          ))}
        </div>
      </section>
    </div>
  );
}
