import { Component, type ReactNode } from "react";
import { translateStatic } from "../lib/i18n";

/**
 * Catches a render error so one broken screen cannot blank the whole popover.
 *
 * React unmounts the entire tree on an uncaught render error, which in a
 * menu-bar app means the window goes white — no tab bar, no way back, and
 * nothing saying what happened. The same rule the remote modules follow applies
 * here: never silently show nothing.
 *
 * The copy comes from `translateStatic` rather than `useSettings`: this is a
 * class component, and the outermost instance of it deliberately sits above
 * `SettingsProvider` so that it still catches a failure in the provider itself.
 * An app that is Nepali everywhere until something goes wrong is not a Nepali
 * app — the moment that needs the most trust is the one that has to be in the
 * user's language.
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
      <div role="alert" className="space-y-2 p-3">
        <p className="text-[13px] font-semibold">{translateStatic("error.render-failed")}</p>
        <p className="text-[11px] text-text-secondary">
          {translateStatic("error.render-failed-hint")}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="settings-btn"
        >
          {translateStatic("action.retry")}
        </button>
      </div>
    );
  }
}
