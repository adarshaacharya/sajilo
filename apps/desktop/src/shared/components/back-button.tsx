import { useSettings } from "../context/settings-context";
import { Icon } from "./icon";

/**
 * The one back control, sized the way a macOS toolbar draws it: a small
 * chevron with no plate at rest and only a faint translucent one under the
 * pointer. It used to borrow `.icon-btn`, whose 26px solid hover square read as
 * a web button parked in the title bar.
 */
export function BackButton({ onClick }: { onClick: () => void }) {
  const { t } = useSettings();

  return (
    <button type="button" onClick={onClick} aria-label={t("action.back")} className="back-btn">
      <Icon name="chevronLeft" className="size-3" />
    </button>
  );
}
