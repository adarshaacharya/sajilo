import { useLocation, useNavigate } from "react-router";

/**
 * The popover has no title bar of its own — the window is undecorated — so this
 * is also the drag handle. `data-tauri-drag-region` is what lets the user move
 * the window by its header.
 */
export function Header({ title }: { title: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const canGoBack = pathname !== "/";

  return (
    <header
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3"
    >
      {canGoBack && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="rounded-md px-1.5 py-0.5 text-text-secondary hover:bg-surface-hover hover:text-text"
        >
          ‹
        </button>
      )}
      <h1 data-tauri-drag-region className="text-sm font-semibold">
        {title}
      </h1>
    </header>
  );
}
