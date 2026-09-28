import { useSettings } from "../context/settings-context";
import { setMini } from "../lib/popover-kept";
import { Icon } from "./icon";

/** Beside the pin: shrink to the mini strip, which pins it too, in one click. */
export function MiniViewButton({ iconClassName }: { iconClassName?: string }) {
  const { t } = useSettings();
  return (
    <button
      type="button"
      onClick={() => setMini(true)}
      aria-label={t("popover.mini")}
      title={t("popover.mini-hint")}
      className="icon-btn shrink-0"
    >
      <Icon name="shrink" className={iconClassName} />
    </button>
  );
}
