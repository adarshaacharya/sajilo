import { SkeletonBlock, SkeletonLine } from "../../../shared/components/skeleton";

const PARAGRAPHS = [
  ["w-full", "w-full", "w-11/12", "w-2/5"],
  ["w-full", "w-10/12", "w-3/5"],
  ["w-full", "w-full", "w-1/2"],
];

/** A government notice while the digest loads: source pill, title, meta, body. */
export function NoticeSkeleton() {
  return (
    <div className="px-0.5 pb-1">
      <SkeletonBlock className="h-[20px] w-28 rounded-full" />
      <div className="mt-2.5">
        <SkeletonLine className="text-[16px] leading-snug" bar="w-full" />
        <SkeletonLine className="text-[16px] leading-snug" bar="w-3/5" />
      </div>
      <SkeletonLine className="mt-2 text-[11px]" bar="w-1/2" />
      <div className="section-divider mt-3 space-y-2.5 pt-3">
        {PARAGRAPHS.map((lines, paragraph) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder paragraphs
          <div key={paragraph}>
            {lines.map((bar, line) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder lines
              <SkeletonLine key={line} className="text-[12px] leading-relaxed" bar={bar} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
