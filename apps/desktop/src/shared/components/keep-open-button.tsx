import { useSettings } from "../context/settings-context";
import { setKept, useKept } from "../lib/popover-kept";
import { Icon } from "./icon";

/**
 * The header's pin. Pressed, the popover stays open on a click away and
 * drags by its header; pressed again, it closes on a click away and opens at
 * the tray as before.
 */
export function KeepOpenButton({ iconClassName }: { iconClassName?: string }) {
  const { t } = useSettings();
  const kept = useKept();
  return (
    <button
      type="button"
      onClick={() => setKept(!kept)}
      aria-pressed={kept}
      aria-label={t("popover.keep-open")}
      title={t(kept ? "popover.kept-hint" : "popover.keep-open-hint")}
      className="icon-btn shrink-0"
    >
      <Icon name="pin" className={iconClassName} />
    </button>
  );
}
