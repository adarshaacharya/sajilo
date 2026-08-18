import { Component, type ReactNode } from "react";

/**
 * Catches a render error so one broken screen cannot blank the whole popover.
 *
 * React unmounts the entire tree on an uncaught render error, which in a
 * menu-bar app means the window goes white — no tab bar, no way back, and
 * nothing saying what happened. The same rule the remote modules follow applies
 * here: never silently show nothing.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Kept in the console too: the message on screen has to stay short, and the
    // stack is what actually locates the fault.
    console.error("[Sajilo] render failed", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="space-y-2 p-3">
        <p className="font-semibold">Something broke on this screen.</p>
        <p className="text-[11px] break-words text-text-secondary">{error.message}</p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="rounded-md border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-hover hover:text-text"
        >
          Try again
        </button>
      </div>
    );
  }
}
