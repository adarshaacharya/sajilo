import { isTauri } from "@tauri-apps/api/core";
import { type RefObject, useEffect, useSyncExternalStore } from "react";
import { api } from "./ipc";

/**
 * Whether the popover is kept open with the header's pin (see
 * `window::set_kept`): it stays up on a click away, reopens where it was
 * left, and drags by its header. One value for the whole page, read from the
 * shell once and changed only by the pin.
 */
let kept = false;
let loaded = false;
const listeners = new Set<() => void>();

function publish(next: boolean) {
  kept = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) {
    loaded = true;
    api
      .popoverKept()
      .then((value) => publish(value === true))
      .catch(() => {});
  }
  return () => listeners.delete(listener);
}

export function isKept() {
  return kept;
}

export function useKept() {
  return useSyncExternalStore(subscribe, isKept, () => false);
}

export function setKept(next: boolean) {
  publish(next);
  api.setPopoverKept(next).catch(() => publish(!next));
}

/** What a press on a header must leave alone: its own controls. */
const CONTROLS = "button, a, input, select, textarea, [role='button'], [role='tab']";

/**
 * Makes `ref`'s element a title bar while the popover is kept open: a press on
 * it moves the window. Its own buttons and fields stay ordinary controls.
 * Window chrome rather than a page control, so it is a native listener: moving
 * a window from the keyboard is the operating system's own shortcut.
 */
export function useDragWhenKept(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const bar = ref.current;
    if (!bar || !isTauri()) return;
    const press = (event: MouseEvent) => {
      if (!kept || event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest(CONTROLS)) return;
      event.preventDefault();
      import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
        .catch(() => {});
    };
    bar.addEventListener("mousedown", press);
    return () => bar.removeEventListener("mousedown", press);
  }, [ref]);
}
