import { SkeletonBlock, SkeletonLine } from "../../../shared/components/skeleton";

/** Days Open-Meteo is asked for; see `FORECAST_DAYS` in the provider. */
const FORECAST_DAYS = 6;

/** The sky card's reading while it loads: the big temperature and its three lines. */
export function SkyReadingSkeleton() {
  return (
    <div className="flex items-start gap-3">
      <SkeletonBlock tone="current" className="h-[54px] w-[92px] shrink-0 rounded-[10px]" />
      <div className="mt-1.5 min-w-0 flex-1 space-y-0.5">
        <SkeletonLine tone="current" className="text-[13px]" bar="w-3/5" />
        <SkeletonLine tone="current" className="text-[11px]" bar="w-4/5" />
        <SkeletonLine tone="current" className="text-[11px]" bar="w-2/5" />
      </div>
    </div>
  );
}

/** Everything under the sky card that waits on the same reading. */
export function WeatherDetailsSkeleton() {
  return (
    <>
      <section className="surface-card p-3">
        <div className="flex items-baseline justify-between gap-2">
          <SkeletonLine className="flex-1 text-[11px]" bar="w-1/4" />
          <SkeletonLine className="text-lg" bar="w-20" />
        </div>
        <SkeletonBlock className="mt-2.5 h-2 w-full rounded-full" />
        <div className="mt-2">
          <SkeletonLine className="text-[11px] leading-snug" bar="w-full" />
          <SkeletonLine className="text-[11px] leading-snug" bar="w-1/2" />
        </div>
        <SkeletonLine className="mt-2 text-[11px]" bar="w-3/5" />
      </section>

      <section className="space-y-1.5">
        <SkeletonLine className="px-0.5 text-[11px]" bar="w-1/5" />
        <div className="surface-card px-3 py-1">
          {Array.from({ length: FORECAST_DAYS }, (_, day) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder rows
              key={day}
              className="grid grid-cols-[44px_18px_30px_1fr_30px] items-center gap-1.5 border-b border-divider py-2 last:border-b-0"
            >
              <SkeletonLine className="text-[12px]" bar="w-8" />
              <SkeletonBlock className="size-4 rounded-full" />
              <SkeletonLine className="text-right text-[12px]" bar="w-5" />
              <SkeletonBlock className="h-[5px] rounded-full" />
              <SkeletonLine className="text-[12px]" bar="w-5" />
            </div>
          ))}
        </div>
      </section>

      <SkeletonLine className="px-0.5 text-[10px]" bar="w-1/3" />
    </>
  );
}
