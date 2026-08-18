import { Card } from "../components/Card";
import { useWebviewAge } from "../lib/webviewAge";

/**
 * Stands in for every screen until M6–M9 land.
 *
 * The age readout is not decoration: M4's acceptance criterion is that
 * dismissing the popover hides the window rather than destroying the webview.
 * Watch this number across a dismiss and reopen — it must keep climbing. If it
 * resets to zero, the webview was torn down and rebuilt, which is the failure
 * this milestone exists to rule out.
 */
export function Placeholder({ title }: { title: string }) {
  const age = useWebviewAge();

  return (
    <div className="space-y-3">
      <Card title={title}>
        <p className="text-text-secondary">Arrives in a later milestone.</p>
      </Card>
      <Card title="Webview lifetime">
        <p className="text-text-secondary">
          Alive for <span className="font-semibold text-text">{age}s</span>
        </p>
        <p className="mt-1 text-[11px] text-text-muted">
          Must keep climbing across hide and show. A reset to zero means the popover was destroyed
          rather than hidden.
        </p>
      </Card>
    </div>
  );
}
