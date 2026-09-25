import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CONTROL } from "./control";
import { Icon } from "./icon";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const STEP_MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);
/** Tall enough for five rows of each column, short enough for the popover. */
const PANEL_HEIGHT = 168;

const pad = (value: number) => String(value).padStart(2, "0");

/** The nearest ancestor that scrolls, which is what clips the panel. */
function scrollArea(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

function parse(value: string): { hour: number; minute: number } {
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  return {
    hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 0,
    minute: Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0,
  };
}

/**
 * A time, picked rather than typed.
 *
 * The native `<input type="time">` edits hours and minutes as separate typed
 * segments, and in a small popover the caret jumps between them as you type.
 * This shows the time as a button; tapping it opens two short columns, hours
 * and minutes in fives, with the current value in view. Picking a minute
 * closes it. A minute off the five-minute grid (a plan saved at 7:33) keeps
 * its own row, so a value is never silently rounded.
 *
 * `value` and `onChange` use "HH:MM", the same string the native input did.
 */
export function TimeField({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const { hour, minute } = parse(value);
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const minutes = STEP_MINUTES.includes(minute)
    ? STEP_MINUTES
    : [...STEP_MINUTES, minute].sort((a, b) => a - b);

  // Opens upward when there is no room below, so the bottom rows of a card
  // never push the columns out of the window.
  // Measured against the scrolling area it sits in, not the window: the tab
  // bar covers the window's bottom edge.
  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const box = root.current.getBoundingClientRect();
    const area = scrollArea(root.current)?.getBoundingClientRect();
    const bottom = Math.min(window.innerHeight, area?.bottom ?? window.innerHeight);
    const top = Math.max(0, area?.top ?? 0);
    setAbove(bottom - box.bottom < PANEL_HEIGHT + 8 && box.top - top > PANEL_HEIGHT + 8);
  }, [open]);

  // Scroll the picked hour and minute into the middle of their columns.
  useLayoutEffect(() => {
    if (!open || !root.current) return;
    // Each column scrolls itself; `scrollIntoView` would scroll the screen too.
    for (const selected of root.current.querySelectorAll<HTMLElement>('[aria-selected="true"]')) {
      const column = selected.parentElement;
      if (column) {
        column.scrollTop = selected.offsetTop - column.clientHeight / 2 + selected.clientHeight / 2;
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Close the picker, not the whole popover.
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const set = (next: { hour: number; minute: number }) =>
    onChange(`${pad(next.hour)}:${pad(next.minute)}`);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((shown) => !shown)}
        className={`${CONTROL} flex cursor-pointer items-center justify-between gap-1 text-left tabular-nums hover:bg-surface-hover`}
      >
        <span>
          {pad(hour)}:{pad(minute)}
        </span>
        <Icon name="clock" className="size-3 shrink-0 text-text-muted" />
      </button>

      {open && (
        <div
          id={panelId}
          className={`absolute right-0 z-50 flex w-[112px] min-w-full gap-1 rounded-[8px] border border-[color:var(--color-border)] bg-surface-raised p-1 shadow-lg ${
            above ? "bottom-full mb-1" : "top-full mt-1"
          }`}
          style={{ height: PANEL_HEIGHT }}
        >
          <Column
            label={`${ariaLabel}: hour`}
            items={HOURS}
            selected={hour}
            onPick={(next) => set({ hour: next, minute })}
          />
          <Column
            label={`${ariaLabel}: minute`}
            items={minutes}
            selected={minute}
            onPick={(next) => {
              set({ hour, minute: next });
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function Column({
  label,
  items,
  selected,
  onPick,
}: {
  label: string;
  items: readonly number[];
  selected: number;
  onPick: (value: number) => void;
}) {
  return (
    <div
      role="listbox"
      aria-label={label}
      className="relative flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => {
        const isSelected = item === selected;
        return (
          <button
            key={item}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onPick(item)}
            className={`block h-[26px] w-full cursor-pointer rounded-[5px] text-center text-[12px] tabular-nums transition-colors ${
              isSelected
                ? "bg-[color:var(--color-accent-mark)] font-semibold text-[color:var(--color-canvas)]"
                : "text-text hover:bg-surface-hover"
            }`}
          >
            {pad(item)}
          </button>
        );
      })}
    </div>
  );
}
