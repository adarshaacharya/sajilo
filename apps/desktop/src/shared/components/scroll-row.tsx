import {
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { scrollIntoBox } from "../lib/scroll";
import { Icon } from "./icon";

/** Pixels per wheel "line" when a mouse reports lines instead of pixels. */
const LINE = 16;

/**
 * A row that scrolls sideways — chips, tabs, faces — and works with any
 * pointer, not just a trackpad:
 *
 * - An ordinary up/down mouse wheel scrolls it sideways while the pointer is
 *   over it. At either end the wheel is handed back to the page, so hovering
 *   a row never traps the screen's own scroll. A trackpad's sideways swipe is
 *   left to the browser.
 * - Whichever side hides more fades out and grows a ‹ or › that pages it,
 *   because a row with its scrollbar hidden otherwise gives no sign there is
 *   anything past the edge.
 * - The chosen item (aria-pressed / aria-selected / aria-current) is kept in
 *   view, so returning to a screen never leaves the selection off-screen.
 *
 * `className` styles the scrolling row itself (its flex gap, padding, border).
 * The fades are drawn over the row, not masked into it: WebKit repaints a
 * masked box that scrolls without its content for a frame (see `Segmented`).
 * Inside a card they take the card's colour; set `--scroll-row-bg` elsewhere.
 */
export function ScrollRow({
  children,
  className = "",
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const row = ref.current;
    if (!row) return;
    const left = row.scrollLeft > 1;
    const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
    setEdges((current) =>
      current.left === left && current.right === right ? current : { left, right },
    );
  }, []);

  useEffect(() => {
    const row = ref.current;
    if (!row) return;

    row.addEventListener("scroll", measure, { passive: true });
    // Items arrive late (a catalogue loading) and change width (a label
    // translating), so both the row and every item are watched.
    const sizes = new ResizeObserver(measure);
    const watch = () => {
      sizes.disconnect();
      sizes.observe(row);
      for (const child of Array.from(row.children)) sizes.observe(child);
      measure();
    };
    const items = new MutationObserver(watch);
    items.observe(row, { childList: true });
    watch();
    return () => {
      row.removeEventListener("scroll", measure);
      sizes.disconnect();
      items.disconnect();
    };
  }, [measure]);

  useWheelScroll(ref);

  // Keep the chosen item on screen. Scrolls only the row, never the page
  // (or, on the landing site, the page around the frame).
  const chosen = useChosenKey(ref);
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row || chosen === null) return;
    const item = row.querySelector<HTMLElement>(SELECTED);
    // Centred rather than nearest: at the edge it would sit under the fade.
    if (item) scrollIntoBox(item, "x", "center");
  }, [chosen]);

  const page = (direction: 1 | -1) => {
    const row = ref.current;
    if (!row) return;
    row.scrollBy({ left: direction * row.clientWidth * 0.7, behavior: "smooth" });
  };

  const more =
    edges.left && edges.right ? "both" : edges.left ? "start" : edges.right ? "end" : undefined;

  return (
    <div className="scroll-row" data-more={more}>
      <div
        ref={ref}
        className={`scroll-row__track overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
        {...rest}
      >
        {children}
      </div>
      {edges.left && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => page(-1)}
          className="scroll-row__edge scroll-row__edge--left"
        >
          <Icon name="chevronLeft" className="size-3" />
        </button>
      )}
      {edges.right && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => page(1)}
          className="scroll-row__edge scroll-row__edge--right"
        >
          <Icon name="chevronLeft" className="size-3 rotate-180" />
        </button>
      )}
    </div>
  );
}

/**
 * An ordinary up/down wheel scrolls `ref` sideways while the pointer is over
 * it and it has somewhere to go; at either end the wheel is left to the page.
 * A sideways gesture (a trackpad swipe, a tilt wheel) is left to the browser.
 */
export function useWheelScroll(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const row = ref.current;
    if (!enabled || !row) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const max = row.scrollWidth - row.clientWidth;
      if (max <= 0) return;
      const delta = event.deltaMode === 1 ? event.deltaY * LINE : event.deltaY;
      if ((delta < 0 && row.scrollLeft <= 0) || (delta > 0 && row.scrollLeft >= max - 1)) return;
      event.preventDefault();
      row.scrollLeft += delta;
    };
    row.addEventListener("wheel", onWheel, { passive: false });
    return () => row.removeEventListener("wheel", onWheel);
  }, [ref, enabled]);
}

const SELECTED = '[aria-pressed="true"], [aria-selected="true"], [aria-current="true"]';

/** Which item is chosen, as a string that changes when the choice does. */
function useChosenKey(ref: RefObject<HTMLDivElement | null>): string | null {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const read = () => {
      const items = Array.from(row.children);
      const index = items.findIndex(
        (item) => item.matches(SELECTED) || item.querySelector(SELECTED) !== null,
      );
      setKey(index === -1 ? null : String(index));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(row, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-pressed", "aria-selected", "aria-current"],
      childList: true,
    });
    return () => observer.disconnect();
  }, [ref]);
  return key;
}
