import { isLinux } from "../lib/platform";
import { useKept, useMini } from "../lib/popover-kept";

type Direction =
  | "North"
  | "South"
  | "East"
  | "West"
  | "NorthEast"
  | "NorthWest"
  | "SouthEast"
  | "SouthWest";

/** Edge, then corner: corners come last so they sit above the edges. */
const EDGES: { direction: Direction; className: string }[] = [
  { direction: "North", className: "top-0 inset-x-2 h-1 cursor-n-resize" },
  { direction: "South", className: "bottom-0 inset-x-2 h-1 cursor-s-resize" },
  { direction: "West", className: "left-0 inset-y-2 w-1 cursor-w-resize" },
  { direction: "East", className: "right-0 inset-y-2 w-1 cursor-e-resize" },
  { direction: "NorthWest", className: "top-0 left-0 size-2 cursor-nw-resize" },
  { direction: "NorthEast", className: "top-0 right-0 size-2 cursor-ne-resize" },
  { direction: "SouthWest", className: "bottom-0 left-0 size-2 cursor-sw-resize" },
  { direction: "SouthEast", className: "bottom-0 right-0 size-2 cursor-se-resize" },
];

/**
 * The pinned popover's edges, on Linux. Its window has no frame, and GTK
 * finds the edge of a frameless window from the pointer moving over the window
 * itself — but the page covers all of it, so the pointer never does. No resize
 * cursor showed until a right-click woke GTK up. These thin strips show the
 * cursor and start the resize themselves. Elsewhere the system does both.
 */
export function ResizeEdges() {
  const kept = useKept();
  const mini = useMini();
  if (!isLinux || !kept || mini) return null;

  const start = (direction: Direction) => {
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().startResizeDragging(direction))
      .catch(() => {});
  };

  return (
    <>
      {EDGES.map(({ direction, className }) => (
        <div
          key={direction}
          aria-hidden="true"
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            start(direction);
          }}
          className={`fixed z-[100] ${className}`}
        />
      ))}
    </>
  );
}
