import { motion } from "motion/react";
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { spring } from "../lib/motion";
import { scrollIntoBoxIfNeeded } from "../lib/scroll";
import { Icon, type IconName } from "./icon";
import { useWheelScroll } from "./scroll-row";

const thumbClass = (small: boolean) =>
  `seg-thumb absolute inset-0 z-0 ${small ? "rounded-[4px]" : "rounded-[6px]"}`;

type Option<T extends string> = { id: T; label: string; icon?: IconName };

/**
 * macOS NSSegmentedControl — recessed track, sliding thumb.
 * Four or more segments scroll horizontally so labels are not truncated.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  scrollable,
  size = "md",
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  /** Default: scroll when there are 4+ segments. */
  scrollable?: boolean;
  /** `sm` is a control-height switch for a choice inside a form row, where a
   * full tab bar would outweigh the fields around it. */
  size?: "md" | "sm";
}) {
  const scroll = scrollable ?? options.length >= 4;
  const small = size === "sm";
  const track = useRef<HTMLDivElement>(null);
  const more = useHiddenSides(track, scroll);
  useWheelScroll(track, scroll);
  useLayoutEffect(() => {
    if (!scroll) return;
    const selected = track.current?.querySelector<HTMLElement>(
      `[data-segment="${CSS.escape(value)}"]`,
    );
    if (selected) scrollIntoBoxIfNeeded(selected, "x", "nearest");
  }, [scroll, value]);

  const radius = small ? "rounded-[6px]" : "rounded-[8px]";
  return (
    // The edge fades are drawn over the track rather than masked into it: a
    // masked box that scrolls while the thumb slides is redrawn by WebKit
    // without its content for a frame, and the whole strip flashed black.
    <div className={`seg-shell relative shrink-0 ${radius}`} data-more={more}>
      <div
        ref={track}
        role="tablist"
        aria-label={label}
        // `isolate`: one layer for the whole track, so every label can sit
        // above the sliding thumb (see below).
        className={`seg-track relative isolate flex ${small ? "h-[22px] p-[2px]" : "h-[30px] p-[3px]"} ${radius} ${scroll ? "seg-track--scroll" : ""}`}
      >
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              data-segment={option.id}
              aria-selected={selected}
              onClick={() => onChange(option.id)}
              // No z-index on the segment itself: that would give each one its own
              // layer, and the thumb, which belongs to the picked segment, would
              // slide over the labels of the segments it passes.
              className={`seg-segment relative flex h-full items-center justify-center gap-1 ${small ? "rounded-[4px] px-2 text-[10px]" : "rounded-[6px] text-[11px]"} ${scroll ? "min-w-0 px-2.5" : small ? "" : "px-1"} font-medium ${
                scroll ? "shrink-0" : "flex-1"
              } ${selected ? "text-text" : "text-text-secondary hover:text-text"}`}
            >
              {selected &&
                (scroll ? (
                  <span className={thumbClass(small)} />
                ) : (
                  <motion.span
                    layoutId={`seg-thumb-${label}`}
                    layout="position"
                    className={thumbClass(small)}
                    transition={spring.tab}
                  />
                ))}
              <span className="relative z-[2] flex min-w-0 items-center gap-1">
                {option.icon && (
                  <Icon
                    name={option.icon}
                    className={`size-3 shrink-0 ${selected ? "text-[color:var(--color-accent-mark)]" : "text-current"}`}
                  />
                )}
                <span className="whitespace-nowrap">{option.label}</span>
              </span>
            </button>
          );
        })}
      </div>
      {scroll && (
        <>
          <span aria-hidden="true" className={`seg-fade seg-fade--start ${radius}`} />
          <span aria-hidden="true" className={`seg-fade seg-fade--end ${radius}`} />
        </>
      )}
    </div>
  );
}

type HiddenSides = "start" | "end" | "both" | undefined;

/** Which ends of a scrolling track have tabs out of view, for its edge fade. */
function useHiddenSides(track: RefObject<HTMLDivElement | null>, enabled: boolean): HiddenSides {
  const [sides, setSides] = useState<HiddenSides>();

  useEffect(() => {
    const element = track.current;
    if (!enabled || !element) return;
    const measure = () => {
      const start = element.scrollLeft > 1;
      const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      setSides(start && end ? "both" : start ? "start" : end ? "end" : undefined);
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    // Resizes and late font loads change what fits, not just scrolling.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [track, enabled]);

  return enabled ? sides : undefined;
}
