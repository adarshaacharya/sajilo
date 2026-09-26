/**
 * Scrolls `element` into view inside its own scrolling box, and nothing else.
 *
 * `Element.scrollIntoView` scrolls every scrollable ancestor up to the top —
 * including, for a page inside an iframe, the page around it. The landing
 * site embeds these screens that way, so a tab strip bringing its selected
 * tab into view as a frame loaded would yank the visitor's page to it midway
 * through a scroll. This moves only the nearest box that actually scrolls on
 * that axis.
 */
export function scrollIntoBox(
  element: HTMLElement,
  axis: "x" | "y",
  align: "nearest" | "center",
  behavior: ScrollBehavior = "auto",
) {
  const box = scrollingAncestor(element, axis);
  if (!box) return;
  const item = element.getBoundingClientRect();
  const frame = box.getBoundingClientRect();
  const start = axis === "x" ? item.left - frame.left : item.top - frame.top;
  const size = axis === "x" ? item.width : item.height;
  const view = axis === "x" ? box.clientWidth : box.clientHeight;
  const current = axis === "x" ? box.scrollLeft : box.scrollTop;

  let offset: number;
  if (align === "center") {
    offset = start - (view - size) / 2;
  } else if (start < 0) {
    offset = start;
  } else if (start + size > view) {
    offset = start + size - view;
  } else {
    return;
  }
  box.scrollTo({ [axis === "x" ? "left" : "top"]: current + offset, behavior });
}

/** Scrolls when needed; returns whether the scroll position changed. */
export function scrollIntoBoxIfNeeded(
  element: HTMLElement,
  axis: "x" | "y",
  align: "nearest" | "center",
): boolean {
  const box = scrollingAncestor(element, axis);
  if (!box) return false;
  const before = axis === "x" ? box.scrollLeft : box.scrollTop;
  scrollIntoBox(element, axis, align);
  const after = axis === "x" ? box.scrollLeft : box.scrollTop;
  return after !== before;
}

function scrollingAncestor(element: HTMLElement, axis: "x" | "y"): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    const overflow = axis === "x" ? style.overflowX : style.overflowY;
    const room =
      axis === "x" ? node.scrollWidth > node.clientWidth : node.scrollHeight > node.clientHeight;
    if (room && /(auto|scroll|overlay)/.test(overflow)) return node;
  }
  return null;
}
